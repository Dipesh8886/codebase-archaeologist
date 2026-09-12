/**
 * Express 4 doesn't automatically catch errors thrown inside async route
 * handlers — an unhandled rejection there crashes the entire Node process
 * (exactly what's been happening). Wrapping every handler with this
 * forwards any thrown error to Express's error-handling middleware
 * instead, which returns a normal error response and keeps the server
 * running for every other user/request.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
