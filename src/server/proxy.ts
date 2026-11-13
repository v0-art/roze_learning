import type {Express} from 'express';

/** Only enable when the application is reachable solely through the configured Caddy proxy. */
export function configureCaddyProxy(app:Express,enabled:boolean):void {
 if(enabled)app.set('trust proxy',1);
}
