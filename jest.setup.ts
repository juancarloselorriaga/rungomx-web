// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// React 19 compatibility: Ensure act is available
// React 19 moved act from react-dom/test-utils to the react package
// https://react.dev/warnings/react-dom-test-utils

// @testing-library/react imports react-dom/test-utils and expects it to have an act function
// In React 19, act is in the react package, not react-dom/test-utils
// We need to ensure react-dom/test-utils.act delegates to React.act
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')

// Before any imports, ensure the act function is available from react-dom/test-utils
jest.mock('react-dom/test-utils', () => ({
  __esModule: true,
  act: React.act,
}))
