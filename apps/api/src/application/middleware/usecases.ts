import { createMiddleware } from 'hono/factory';
import type { Usecases } from '../../usecase';
import type { RequestLogger } from '../../usecase/ports';
import type { AppEnv, Bindings } from '../env';
import { requestLoggerFor } from '../logger';

/** composition root（src/composition.ts）の型。application は datasource を直接 import しない */
export type ComposeUsecases = (env: Bindings, log: RequestLogger) => Usecases;

/** リクエストごとに usecase を組み立てて c.var.usecases に入れる（decisions C22） */
export function provideUsecases(compose: ComposeUsecases) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('usecases', compose(c.env, requestLoggerFor(c)));
    await next();
  });
}
