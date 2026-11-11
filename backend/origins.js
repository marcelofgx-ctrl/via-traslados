// Origins for Vía Traslados. Exact QA aliases only: never permit arbitrary *.pages.dev.
// QA shares the current API/D1 until a fully isolated QA backend is provisioned.
export const QA_PASSENGER_ORIGINS = Object.freeze([
  'https://via-traslados-pasajeros.pages.dev',
  'https://visual-premium-qa.via-traslados-pasajeros.pages.dev'
]);

const publicPassengerPath = path =>
  path === '/api/health' ||
  path === '/api/public/status' ||
  path === '/api/public/route-preview' ||
  path === '/api/requests' ||
  path.startsWith('/api/requests/') ||
  path.startsWith('/api/auth/') ||
  path.startsWith('/api/customer/');

const originOf = raw => {
  try {
    const url=new URL(raw);
    if(url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== ''))return null;
    return url.origin;
  } catch {return null;}
};

export function allowedOriginsFor(env,path) {
  const approved = [env.PUBLIC_ORIGIN,env.OPERATOR_ORIGIN]
    .map(originOf).filter(Boolean);
  if(publicPassengerPath(path))approved.push(...QA_PASSENGER_ORIGINS);
  return [...new Set(approved)];
}

export function expectedChallengeHostname(request, env) {
  const origin = request.headers.get('Origin');
  const path = new URL(request.url).pathname;
  if(origin) {
    if(!allowedOriginsFor(env,path).includes(origin))return null;
    return new URL(origin).hostname;
  }
  return originOf(env.PUBLIC_ORIGIN) ? new URL(env.PUBLIC_ORIGIN).hostname : null;
}
