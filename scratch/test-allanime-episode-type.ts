import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function introspectEpisodeType() {
    const src = new AllAnimeSource();
    
    console.log('Introspecting Episode type fields...');
    
    try {
        const query = `
        query {
          __type(name: "Episode") {
            fields {
              name
              type {
                name
                kind
              }
            }
          }
        }`;
        const data = await (src as any).gqlQuery(query);
        console.log('Episode Fields:', JSON.stringify(data?.__type?.fields, null, 2));
    } catch (e: any) {
        console.log('Introspection failed:', e.message);
    }
}

introspectEpisodeType();
