import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function introspectAllAnime() {
    const src = new AllAnimeSource();
    
    console.log('Introspecting AllAnime schema...');
    
    try {
        const query = `
        query {
          __schema {
            queryType {
              fields {
                name
                args {
                  name
                }
              }
            }
          }
        }`;
        const data = await (src as any).gqlQuery(query);
        console.log('Available Query Fields:');
        (data?.__schema?.queryType?.fields || []).forEach((f: any) => {
            console.log(`- ${f.name} (${f.args.map((a: any) => a.name).join(', ')})`);
        });
    } catch (e: any) {
        console.log('Introspection failed:', e.message);
    }
}

introspectAllAnime();
