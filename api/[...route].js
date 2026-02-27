import { routeRequest } from '../server/api-router.js';

export const config = { runtime: 'nodejs22.x' };

export default async function handler(req, res) {
  return routeRequest(req, res, process.env);
}
