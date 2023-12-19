import { expect } from 'chai';
import { pluginE2EHarness } from '@appium/plugin-test-support';
import { remote } from 'webdriverio';
import { HUB_APPIUM_PORT, NODE_APPIUM_PORT, PLUGIN_PATH, ensureAppiumHome, ensureHubConfig, ensureNodeConfig } from '../e2ehelper';
import { Options } from '@wdio/types';
import axios from 'axios';
import { default as chaiAsPromised } from 'chai-as-promised'
import * as chai from 'chai';
import { hub_config, node_config } from '../e2ehelper';
chai.use(chaiAsPromised);

let driver: any;

const WDIO_PARAMS = {
  connectionRetryCount: 0,
  hostname: hub_config.bindHostOrIp,
  port: HUB_APPIUM_PORT,
  logLevel: 'info',
  path: '/'
};

const capabilities = {
  "appium:automationName": "UiAutomator2",
  "appium:app": "https://prod-mobile-artefacts.lambdatest.com/assets/docs/proverbial_android.apk",
  "platformName": "android",
  "appium:deviceName": "",
  "appium:uiautomator2ServerInstallTimeout": 90000,
} as unknown as WebdriverIO.Capabilities

describe('E2E', () => {
  // use ios for hub
  const hub_config_file = ensureHubConfig('ios');

  // and android on node so that we can test session request 
  const node_config_file = ensureNodeConfig();

  // setup appium home
  const APPIUM_HOME = ensureAppiumHome("hub");

  // run hub
  pluginE2EHarness({
    before: global.before,
    after: global.after,
    serverArgs: {
      subcommand: 'server',
      configFile: hub_config_file
    },
    pluginName: 'device-farm',
    port: HUB_APPIUM_PORT,
    driverSource: 'npm',
    driverName: 'uiautomator2',
    driverSpec: 'appium-uiautomator2-driver',
    pluginSource: 'local',
    pluginSpec: PLUGIN_PATH,
    appiumHome: APPIUM_HOME!
  })

  // run node
  pluginE2EHarness({
    before: global.before,
    after: global.after,
    serverArgs: {
      subcommand: 'server',
      configFile: node_config_file
    },
    pluginName: 'device-farm',
    port: NODE_APPIUM_PORT,
    driverSource: 'npm',
    driverName: 'uiautomator2',
    driverSpec: 'appium-uiautomator2-driver',
    pluginSource: 'local',
    pluginSpec: PLUGIN_PATH,
    appiumHome: APPIUM_HOME!
  })

  it('node can handle appium request on its own (hub still need to run)', async () => {
    const node_wdio_params = Object.assign({}, WDIO_PARAMS, { hostname: node_config.bindHostOrIp, port: NODE_APPIUM_PORT });
    console.log(`Node wdio params: ${JSON.stringify(node_wdio_params)}`);
    console.log(`node config: ${JSON.stringify(node_config)}`);
    driver = await remote({ ...node_wdio_params, capabilities } as Options.WebdriverIO);
    expect(driver).to.be.not.undefined;
  });


  it('can forward session request to node', async () => {
    if (hub_config.bindHostOrIp == node_config.bindHostOrIp) {
      it.skip('node and hub should not be using the same host');
    }

    // hub and node should be running
    const hub_url = `http://${hub_config.bindHostOrIp}:${HUB_APPIUM_PORT}`;
    const node_url = `http://${node_config.bindHostOrIp}:${NODE_APPIUM_PORT}`;

    console.log(`Hub url: ${hub_url}`);
    
    expect(axios.get(`${hub_url}/device-farm`)).to.eventually.equal(200, "hub should be running");
    expect(axios.get(`${node_url}/device-farm`)).to.eventually.equal(200, "node should be running");

    // all devices
    const allDevices = (await axios.get(`http://${hub_config.bindHostOrIp}:${HUB_APPIUM_PORT}/device-farm/api/devices`)).data;

    // there should be at least one device
    // expect(allDevices.length).to.be.greaterThan(0);

    // wait until there is at least one device


    // one of the device should come from node
    const nodeDevice = allDevices.filter((device: any) => device.host?.includes(node_config.bindHostOrIp));
    
    expect(nodeDevice).to.not.be.undefined;

    console.log(`Node device: ${JSON.stringify(nodeDevice)}`);

    driver = await remote({ ...WDIO_PARAMS, capabilities } as Options.WebdriverIO);

    // busy device should be on the node
    const newAllDevices = (await axios.get(`http://${hub_config.bindHostOrIp}:${HUB_APPIUM_PORT}/device-farm/api/devices`)).data;
    const busyDevice = newAllDevices.filter((device: any) => device.busy);

    // device should have host as node_config.bindHostOrIp
    expect(busyDevice[0]).to.have.property('host', node_config.bindHostOrIp);
  });


  afterEach(async function() {
    if (driver !== undefined) {
      await driver.deleteSession()
      driver = undefined;
    }
  });
});