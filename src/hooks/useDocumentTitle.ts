import { useEffect } from 'react';

const SITE_NAME = 'AniFox';

export function useDocumentTitle(title?: string, appendSiteName = true) {
  useEffect(() => {
    const prev = document.title;
    document.title = title
      ? appendSiteName ? `${title} — ${SITE_NAME}` : title
      : SITE_NAME;
    return () => { document.title = prev; };
  }, [title, appendSiteName]);
}
