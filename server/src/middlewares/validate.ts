import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../lib/errors';

interface Schemas {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
}

/**
 * Joi validation middleware factory. Validates and replaces req fields with
 * coerced values. Rejects unknown keys by default.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        const { value, error } = schemas.params.validate(req.params, { abortEarly: false });
        if (error) throw new ValidationError('Invalid request params', error.details.map((d) => d.message));
        req.params = value;
      }
      if (schemas.query) {
        const { value, error } = schemas.query.validate(req.query, { abortEarly: false });
        if (error) throw new ValidationError('Invalid query parameters', error.details.map((d) => d.message));
        // express 5 makes req.query a getter; assign via defineProperty for safety
        Object.defineProperty(req, 'query', { value, writable: true, configurable: true });
      }
      if (schemas.body) {
        const { value, error } = schemas.body.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) throw new ValidationError('Invalid request body', error.details.map((d) => d.message));
        req.body = value;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
