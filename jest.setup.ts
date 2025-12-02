// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// React 19 compatibility: Ensure act is available
// React 19 moved act from react-dom/test-utils to the react package
// https://react.dev/warnings/react-dom-test-utils

// Mock react-dom/test-utils to properly delegate to React.act
// This is needed because @testing-library/react internally uses act from react-dom/test-utils
// which expects React.act to be available, but module loading order can cause issues
jest.mock('react-dom/test-utils', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  return {
    act: React.act,
  }
})
