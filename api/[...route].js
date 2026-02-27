import { routeRequest } from '../server/api-router.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  return routeRequest(req, res, process.env);
}
