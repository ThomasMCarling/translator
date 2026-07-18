import { ELEVENLABS_API_KEY } from '$env/static/private';
import { error, json } from '@sveltejs/kit';

export async function POST() {

    const resp = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        headers: {
            ['xi-api-key']: ELEVENLABS_API_KEY
        },
        method: 'POST'
    });

    if (!resp.ok) {
        throw error(502)
    }

    const data = await resp.json();

    return json(data)

}