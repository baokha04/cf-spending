// Catch-all Pages Function: chuyển toàn bộ /api/* cho Hono app trong src/server.
import app from '../../src/server/app';
import type { Env } from '../../src/server/env';

export const onRequest: PagesFunction<Env> = (context) =>
  app.fetch(context.request, context.env, {
    waitUntil: context.waitUntil.bind(context),
    passThroughOnException: context.passThroughOnException.bind(context),
    props: {},
  });
