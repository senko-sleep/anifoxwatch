import { useEffect } from 'react';

const SITE_NAME = 'AniFox';

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    return () => { document.title = prev; };
  }, [title]);
}
