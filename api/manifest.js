import { handleManifestRequest } from '../server/api-router.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  return handleManifestRequest(request);
}
