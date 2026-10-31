import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Minimal History-API router: real paths, deep links, browser back/forward.
const RouterCtx = createContext({ path: '/', navigate: () => {} });
export const useRouter = () => useContext(RouterCtx);

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname + window.location.search) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
    const u = new URL(to, window.location.origin);
    setLoc({ path: u.pathname, search: u.search });
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback((fallback) => {
    if (window.history.state && window.history.length > 1) window.history.back();
    else navigate(fallback, { replace: true });
  }, [navigate]);
  return <RouterCtx.Provider value={{ ...loc, navigate, back }}>{children}</RouterCtx.Provider>;
}

export function matchPath(pattern, path) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
