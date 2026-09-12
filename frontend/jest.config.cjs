module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss)$": "<rootDir>/jest.styleMock.cjs",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
};
