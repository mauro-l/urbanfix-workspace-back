import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'El JSON enviado no es válido.' });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    res.status(409).json({ error: 'El recurso ya existe.' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
};
