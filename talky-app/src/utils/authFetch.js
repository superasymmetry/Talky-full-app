export function makeAuthFetch(getAccessTokenSilently) {
  return async function authFetch(url, options = {}) {
    const token = await getAccessTokenSilently();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };
    return fetch(url, { ...options, headers });
  };
}
