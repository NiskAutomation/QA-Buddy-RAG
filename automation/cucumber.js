module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    requireModule: ['ts-node/register/transpile-only'],
    require: ['features/steps/**/*.ts'],
    format: ['progress-bar', 'allure-cucumberjs/reporter'],
    formatOptions: { resultsDir: 'allure-results' },
    parallel: 2,
    retry: process.env.CI ? 1 : 0,
    worldParameters: {
      baseURL: process.env.QA_AGENT_BASE_URL || 'http://127.0.0.1:4173',
      browser: process.env.BROWSER || 'chromium'
    }
  }
};
