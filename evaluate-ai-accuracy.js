const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// ─── App Prediction Logic (Exact copy from app.js) ──────────────────────────
function linearRegressionForecast(data, periods) {
    const n = data.length;
    if (n === 0) return Array(periods).fill(0);
    
    const x = Array.from({ length: n }, (_, i) => i);
    const y = data;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXX - sumX * sumX) === 0 ? 0 : (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const forecast = [];
    for (let i = 0; i < periods; i++) {
        const val = intercept + slope * (n + i);
        forecast.push(Math.max(0, val)); // Prevent negative sales predictions
    }

    return forecast;
}

function sarimaForecast(data, periods) {
    const n = data.length;
    if (n < 8) return Array(periods).fill(0);
    const seasonalPeriod = 7; // Weekly seasonality

    // Calculate moving averages (7-day)
    const ma = [];
    for (let i = 6; i < n; i++) {
        ma.push(data.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
    }

    // Calculate seasonal ratios (guard against division by zero)
    const seasonal = [];
    for (let i = seasonalPeriod; i < n; i++) {
        const prev = data[i - seasonalPeriod];
        seasonal.push(prev > 0 ? data[i] / prev : 1.0);
    }
    const validSeasonal = seasonal.filter(v => isFinite(v) && !isNaN(v) && v > 0);
    const avgSeasonal = validSeasonal.length > 0 ? validSeasonal.reduce((a, b) => a + b, 0) / validSeasonal.length : 1.0;

    // Trend from moving averages
    const trend = [];
    for (let i = 1; i < ma.length; i++) {
        trend.push(ma[i] - ma[i - 1]);
    }
    const validTrend = trend.filter(v => isFinite(v) && !isNaN(v));
    const avgTrend = validTrend.length > 0 ? validTrend.reduce((a, b) => a + b, 0) / validTrend.length : 0;

    // Generate forecast
    const forecast = [];
    const nonZero = data.filter(v => v > 0);
    const baseValue = nonZero.length > 0 ? nonZero[nonZero.length - 1] : (ma.length > 0 ? ma[ma.length - 1] : 0);

    for (let i = 0; i < periods; i++) {
        const seasonalIndex = i % seasonalPeriod;
        const sf = (seasonal[seasonalIndex] && isFinite(seasonal[seasonalIndex]) && seasonal[seasonalIndex] > 0)
            ? seasonal[seasonalIndex] : avgSeasonal;
        
        // Correct formula: (Base + (Trend * Steps)) * SeasonalFactor
        const predictedValue = (baseValue + (avgTrend * (i + 1))) * sf;
        forecast.push(Math.max(0, Math.round(predictedValue * 100) / 100));
    }

    return forecast;
}

// - -- - Exponential Smoothing (Holt-Winters Triple) - -- -
function exponentialSmoothingForecast(data, periods) {
    const n = data.length;
    if (n < 8) return Array(periods).fill(0);

    const seasonLength = 7; // weekly cycle
    const alpha = 0.3; // level smoothing
    const beta = 0.1; // trend smoothing
    const gamma = 0.2; // seasonal smoothing

    // Initialise level, trend, seasonal
    const firstWeek = data.slice(0, seasonLength);
    const secondWeek = data.slice(seasonLength, seasonLength * 2);
    let level = firstWeek.reduce((s, v) => s + v, 0) / seasonLength;
    let trend = 0;
    if (secondWeek.length === seasonLength) {
        const secondAvg = secondWeek.reduce((s, v) => s + v, 0) / seasonLength;
        trend = (secondAvg - level) / seasonLength;
    }

    // Initial seasonal indices
    const seasonals = [];
    for (let i = 0; i < seasonLength; i++) {
        seasonals[i] = level > 0 ? firstWeek[i] / level : 1.0;
    }

    // Smooth through historical data
    for (let t = 0; t < n; t++) {
        const si = t % seasonLength;
        const val = data[t];
        const prevLevel = level;
        const s = seasonals[si] || 1;

        // Update level
        level = alpha * (s > 0 ? val / s : val) + (1 - alpha) * (prevLevel + trend);
        // Update trend
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        // Update seasonal
        seasonals[si] = gamma * (level > 0 ? val / level : 1) + (1 - gamma) * s;
    }

    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= periods; i++) {
        const si = (n + i - 1) % seasonLength;
        const predicted = (level + trend * i) * (seasonals[si] || 1);
        forecast.push(Math.max(0, Math.round(predicted * 100) / 100));
    }
    return forecast;
}

// ─── Backtesting Utility ───────────────────────────────────────────────────
async function runBacktest(csvFilePath, dateColumn, salesColumn, testSplitPercent = 20) {
    console.log(`\n======================================================`);
    console.log(`📊 InveXa sTacK - AI Model Backtesting Engine`);
    console.log(`======================================================\n`);
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`❌ Error: CSV file not found at ${csvFilePath}`);
        console.log(`\nPlease download a dataset (e.g., from Kaggle) and ensure the file exists.\n`);
        process.exit(1);
    }

    console.log(`⏳ Loading dataset: ${path.basename(csvFilePath)}...`);
    
    const records = [];
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => {
                const date = data[dateColumn];
                const salesStr = data[salesColumn];
                const sales = parseFloat(salesStr ? salesStr.replace(/[^0-9.-]+/g,"") : 0);
                
                if (date && !isNaN(sales)) {
                    records.push({ date, sales });
                }
            })
            .on('end', () => {
                console.log(`✅ Loaded ${records.length} valid records.\n`);
                
                if (records.length < 10) {
                    console.error('❌ Not enough data for meaningful backtesting. Need at least 10 records.');
                    resolve();
                    return;
                }

                // Sort chronologically
                records.sort((a, b) => new Date(a.date) - new Date(b.date));

                // Aggregate by Date (in case of multiple sales on same day)
                const dailyAggregated = {};
                records.forEach(r => {
                    const parsedDate = new Date(r.date);
                    if (isNaN(parsedDate.getTime())) return; // Skip invalid date formats
                    const d = parsedDate.toISOString().split('T')[0];
                    dailyAggregated[d] = (dailyAggregated[d] || 0) + r.sales;
                });
                
                const timeSeries = Object.keys(dailyAggregated)
                    .sort()
                    .map(d => ({ date: d, sales: dailyAggregated[d] }));

                console.log(`📅 Aggregated into ${timeSeries.length} timeline days.`);

                // Train/Test Split
                const splitIndex = Math.floor(timeSeries.length * (1 - (testSplitPercent / 100)));
                const trainSet = timeSeries.slice(0, splitIndex);
                const testSet = timeSeries.slice(splitIndex);
                
                console.log(`\n✂️  Splitting Data (Train/Test: ${100 - testSplitPercent}% / ${testSplitPercent}%)`);
                console.log(`   - Training Phase: ${trainSet.length} days (Used by Model to learn)`);
                console.log(`   - Testing Phase:  ${testSet.length} days (Hidden from Model, used for accuracy check)`);

                // Run Model
                const trainSales = trainSet.map(d => d.sales);
                const testSales = testSet.map(d => d.sales);
                
                console.log(`\n🤖 Running App Prediction Models (Linear, SARIMA, Holt-Winters)...`);
                
                const models = {
                    "Linear Regression": linearRegressionForecast(trainSales, testSet.length),
                    "SARIMA (Seasonal ARIMA)": sarimaForecast(trainSales, testSet.length),
                    "Holt-Winters Exponential": exponentialSmoothingForecast(trainSales, testSet.length)
                };

                console.log(`\n📈 --- BACKTESTING RESULTS ---`);
                console.log(`Model generated forecast for ${testSet.length} future days.`);
                
                let bestModel = { name: "", accuracy: 0 };

                for (const [modelName, predictions] of Object.entries(models)) {
                    let totalAbsError = 0;
                    let totalSqError = 0;
                    let totalActual = 0;
                    
                    for (let i = 0; i < testSet.length; i++) {
                        const actual = testSales[i];
                        const predicted = predictions[i];
                        const error = Math.abs(actual - predicted);
                        
                        totalAbsError += error;
                        totalSqError += (error * error);
                        totalActual += actual;
                    }

                    const mae = totalAbsError / testSet.length;
                    const rmse = Math.sqrt(totalSqError / testSet.length);
                    const avgActual = totalActual / testSet.length;
                    
                    const percentageError = avgActual > 0 ? (mae / avgActual) * 100 : 0;
                    const accuracy = Math.max(0, 100 - percentageError);
                    
                    if (accuracy > bestModel.accuracy) {
                        bestModel = { name: modelName, accuracy: accuracy };
                    }

                    console.log(`\n🔹 Model: **${modelName}**`);
                    console.log(`   Mean Absolute Error (MAE):  ±${mae.toFixed(2)} units/day`);
                    console.log(`   Root Mean Sq Error (RMSE):  ±${rmse.toFixed(2)}`);
                    console.log(`   🎯 Accuracy Score: ${accuracy.toFixed(2)}%`);
                }

                console.log(`\n🏆 Champion Model for this dataset: **${bestModel.name}** (${bestModel.accuracy.toFixed(2)}%)`);
                console.log(`\n======================================================\n`);
                resolve();
            });
    });
}

// ─── Command Line Interface ────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log(`
Usage: node evaluate-ai-accuracy.js <path_to_csv> <date_column_name> <sales_column_name> [test_split_percent]

Example:
  node evaluate-ai-accuracy.js supermarket_sales.csv "Date" "Total" 20
`);
    process.exit(1);
}

const csvFile = args[0];
const dateCol = args[1];
const salesCol = args[2];
const splitPercent = args[3] ? parseInt(args[3], 10) : 20;

runBacktest(csvFile, dateCol, salesCol, splitPercent);
