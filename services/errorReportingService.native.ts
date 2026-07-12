
import { ErrorUtils } from 'expensify-common';
import * as Exceptionless from 'exceptionless-js';
import Config from '../CONFIG';
import get from './Storage';
import Network from './Network';
import CONST from '../CONST';
import pkg from '../package.json';
import getOperatingSystem from './getOperatingSystem';
import getBrowser from './getBrowser';

/**
 * Initialize the Exceptionless JavaScript client with the API key and server URL.
 */
function init() {
    Exceptionless.startup((client) => {
        client.config.apiKey = Config.EXCEPTIONLESS_API_KEY;
        client.config.serverUrl = Config.EXCEPTIONLESS_SERVER_URL;
        client.config.defaultData['@version'] = pkg.version;
        client.config.defaultData.OS = getOperatingSystem();
        client.config.defaultData.browser = getBrowser();
        client.config.defaultData.env = Config.ENVIRONMENT;
        client.config.defaultData.network = {
            isOnline: Network.isOnline(),
            currentStatus: Network.getStatus(),
        };
        client.config.defaultData.device = {
            isNative: true,
        };

        // If we are offline, we want to queue these up to be sent later when we are online.
        client.config.setIsOnline((isOnline) => isOnline);

        // Add a plugin to parse the default data from the storage when the client is ready
        client.config.addPlugin((plugin) => {
            plugin.priority = 100;
            plugin.name = 'Storage Plugin';
            plugin.startup(async (context) => {
                const deviceID = await get(CONST.DEVICE_ID_KEY, '');
                context.client.config.defaultData.device.id = deviceID;
            });
        });

        // Add a plugin to reject logs from the old client, as it causes a lot of noise.
        client.config.addPlugin((plugin) => {
            plugin.priority = 99;
            plugin.name = 'Reject Old Client';
            plugin.onSubmittingEvent((context) => {
                const message = context.event.data.message as string | undefined;
                if (!message) {
                    return;
                }
                const isOldClientError = message.includes('Can\'t find variable: __DEV__')
                    || message.includes('Can\'t find variable: process')
                    || message.includes('Setting a timer for a long period of time')
                    || message.includes('Object.values called on non-object');
                if (isOldClientError) {
                    context.cancel = true;
                }
            });
        });
    });
}

/**
 * Catch and report an error.
 *
 * @param {Error} error
 * @param {Boolean} isCaughtInMainApp
 * @param {Object} errorInfo
 */
function catchError(error: Error, isCaughtInMainApp = false, errorInfo: object = {}) {
    Exceptionless.submitException(error, (event) => {
        event.data.isCaughtInMainApp = isCaughtInMainApp;
        event.data = {...event.data, ...errorInfo};
        ErrorUtils.addErrorInfo(event);
    });
}

/**
 * Log a message.
 *
 * @param {String} message
 */
function logInfo(message: string) {
    Exceptionless.submitLog(message);
}

export default {
    init,
    catchError,
    logInfo,
};
