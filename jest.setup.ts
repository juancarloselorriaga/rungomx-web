// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// React 19 compatibility: Polyfill React.act for @testing-library/react
// React 19 moved act from react-dom/test-utils to the react package
// https://react.dev/warnings/react-dom-test-utils
import React from 'react'

// Ensure React.act exists for @testing-library/react compatibility
if (typeof React.act === 'undefined') {
  // Import act from react for React 19+
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reactPackage = require('react') as typeof React
  if (reactPackage.act) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(React as any).act = reactPackage.act
  }
}
