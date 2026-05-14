import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function introspectEpisodeInfoType() {
    const src = new AllAnimeSource();
    
    console.log('Introspecting EpisodeInfo type fields...');
    
    try {
        const query = `
        query {
          __type(name: "EpisodeInfo") {
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
        console.log('EpisodeInfo Fields:', JSON.stringify(data?.__type?.fields, null, 2));
    } catch (e: any) {
        console.log('Introspection failed:', e.message);
    }
}

introspectEpisodeInfoType();
