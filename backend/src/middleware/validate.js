/**
 * Generic validation middleware: pass a Zod schema, get sanitized
 * req.body/query/params back or a 400 with field-level errors.
 * This is what backs the "all inputs sanitized with Zod" claim —
 * every route that accepts user input runs through this.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req[source] = result.data;
    next();
  };
}
