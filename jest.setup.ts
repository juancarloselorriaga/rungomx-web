// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// React 19 / Testing Library compatibility:
// Provide a robust act shim that works even if React.act or react-dom/test-utils.act
// are missing or not wired up correctly in the current environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactDomTestUtils = (() => {
  try {
    return require('react-dom/test-utils')
  } catch {
    return {}
  }
})()

// Shim for @testing-library/react's internal act-compat module.
// This avoids \"actImplementation is not a function\" crashes in CI environments.
jest.mock('@testing-library/react/dist/act-compat', () => {
  const actImpl =
    typeof React.act === 'function'
      ? React.act
      : typeof ReactDomTestUtils.act === 'function'
        ? ReactDomTestUtils.act
        : (callback: () => unknown) => callback()

  function getGlobalThis() {
    if (typeof globalThis !== 'undefined') return globalThis
    if (typeof self !== 'undefined') return self
    if (typeof window !== 'undefined') return window
    if (typeof global !== 'undefined') return global
    throw new Error('unable to locate global object')
  }

  function setIsReactActEnvironment(isReactActEnvironment: boolean) {
    ;(getGlobalThis() as any).IS_REACT_ACT_ENVIRONMENT = isReactActEnvironment
  }

  function getIsReactActEnvironment() {
    return (getGlobalThis() as any).IS_REACT_ACT_ENVIRONMENT
  }

  function withGlobalActEnvironment(actImplementation: (cb: () => unknown) => any) {
    return (callback: () => unknown) => {
      const previousActEnvironment = getIsReactActEnvironment()
      setIsReactActEnvironment(true)
      try {
        let callbackNeedsToBeAwaited = false
        const actResult = actImplementation(() => {
          const result = callback()
          if (
            result !== null &&
            typeof result === 'object' &&
            typeof (result as any).then === 'function'
          ) {
            callbackNeedsToBeAwaited = true
          }
          return result
        })

        if (callbackNeedsToBeAwaited) {
          const thenable = actResult
          return {
            then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
              thenable.then(
                (returnValue: unknown) => {
                  setIsReactActEnvironment(previousActEnvironment)
                  resolve(returnValue)
                },
                (error: unknown) => {
                  setIsReactActEnvironment(previousActEnvironment)
                  reject(error)
                },
              )
            },
          }
        } else {
          setIsReactActEnvironment(previousActEnvironment)
          return actResult
        }
      } catch (error) {
        setIsReactActEnvironment(previousActEnvironment)
        throw error
      }
    }
  }

  const act = withGlobalActEnvironment(actImpl)

  return {
    __esModule: true,
    default: act,
    getIsReactActEnvironment,
    setReactActEnvironment: setIsReactActEnvironment,
  }
})
