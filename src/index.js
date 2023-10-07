'use strict';

const pkg = require("../package.json");
const mqtt = require( "mqtt" );
const { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } =  require('homebridge');

		
var exports = module.exports;
var globals = {
	log: Logger,
	platformConfig: PlatformConfig,
	api: API
};																																
module.exports.globals = globals;

module.exports = function (homebridge) {
    globals.log.debug("homebridge API version: " + homebridge.version);
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-NEOShadePlatform", "NEOShades", NEOShadePlatform, true);
}
