import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function introspectEnum() {
    const src = new AllAnimeSource();
    
    console.log('Introspecting VaildTranslationTypeEnumType values...');
    
    try {
        const query = `
        query {
          __type(name: "VaildTranslationTypeEnumType") {
            enumValues {
              name
            }
          }
        }`;
        const data = await (src as any).gqlQuery(query);
        console.log('Enum Values:', JSON.stringify(data?.__type?.enumValues, null, 2));
    } catch (e: any) {
        console.log('Introspection failed:', e.message);
    }
}

introspectEnum();
