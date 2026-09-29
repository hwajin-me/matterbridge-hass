# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Home Assistant plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge?label=docker%20pulls)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-hass/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-hass/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-hass/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-hass)
[![tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](https://vitest.dev)
[![styled with Oxc](https://img.shields.io/badge/styled_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/formatter.html)
[![linted with Oxc](https://img.shields.io/badge/linted_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/linter.html)
[![TypeScript Native](https://img.shields.io/badge/TypeScript_Native-3178C6?logo=typescript&logoColor=white)](https://github.com/microsoft/typescript-go)
[![ESM](https://img.shields.io/badge/ESM-Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![matterbridge.io](https://img.shields.io/badge/matterbridge.io-online-brightgreen)](https://matterbridge.io)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows you to expose the Home Assistant devices and individual entities to Matter.

It is the ideal companion of the official [Matterbridge Home Assistant Application](https://github.com/Luligu/matterbridge-home-assistant-addon/blob/main/README.md).

Features:

- This plugin can be used with Matterbridge running in the Matterbridge Official Application or outside Home Assistant.
- The state of the Home Assistant core is checked before starting. The plugin waits for the core to be `RUNNING`.
- The connection with Home Assistant is made throught WebSocket: so Matterbridge can be also in another network if the Home Assistant host is reachable.
- The connection with Home Assistant can be also made with ssl WebSocket (i.e. wss://homeassistant:8123). Self signed certificates are also supported.
- It is possible to filter entities and devices by Area.
- It is possible to filter entities and devices by Label.
- It is possible to select from a list the individual entities to include in the white or black list. Select by name, id or entity_id.
- It is possible to select from a list the devices to include in the white or black list. Select by name or id.
- It is possible to select from a list the entities to include in the device entity black list.
- It is possible to pickup from a list the split entities or to select them adding a label.
- It is possible to postfix the Matter device serialNumber and the Matter device name to avoid collision with other instances.
- Support **Apple Home Adaptive Lighting**. See https://github.com/Luligu/matterbridge/discussions/390.
- Support **transition time**.
- Supports robotic-vacuum Home Assistant area selection through Matter ServiceArea when the vacuum exposes `clean_area`.
- Supports climate fan modes, light effects, and media-player volume through their respective Matter clusters when exposed by Home Assistant.
- Support system unit **CELSIUS** and **FAHRENHEIT**.
- Jest test coverage = 100%.

## How to use filters and select

> Read the explanation [here](https://github.com/Luligu/matterbridge-hass/discussions/186).

## Naming issues on the controller side explained

> For naming issues (especially upsetting with Alexa and Google), read the explanation and the solution [here](https://github.com/Luligu/matterbridge-hass/discussions/86).

## Quick install guide

For new users I suggest to start following this list:

- create an [Home Assistant Token](README.md#token)
- create an Home Assistant Label that will be used to [filter](README.md#filter-by-label) the devices and entities in Home Assistant
- create an Home Assistant Label that will be used to [split](README.md#split-by-label) the device entities in Home Assistant
- find your [Host name or Address](README.md#host)
- add them to the config and restart

Now add the `label for filter` you created before to each device you want to expose to Matter (or to each device entity if you want only some of the device entities).

Add also the `label for split` you created before to each device entity you want to expose like a single Matter device.

Restart, verify that everything is like you intended.

Pair Matterbridge to your controller.

## Supported device entities:

| Domain       | Supported states                           | Supported attributes                                                                                                               |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| switch       | on, off                                    |                                                                                                                                    |
| light        | on, off                                    | brightness, color_mode, color_temp, hs_color, xy_color                                                                             |
| lock         | locked, locking, unlocking, unlocked, open | `open` is exposed as Matter `unlocked` (Matter has no separate lock-open state)                                                    |
| fan          | on, off                                    | percentage, preset_mode (1), direction, oscillating                                                                                |
| cover        | open, closed, opening, closing             | current_position, current_tilt_position (requires lift and tilt positioning)                                                       |
| climate      | off, heat, cool, heat_cool, auto           | current_temperature, temperature, target_temp_low, target_temp_high, min_temp, max_temp, current_humidity, fan_modes, preset_modes |
| humidifier   | on, off                                    | Humidifier and dehumidifier: current_humidity, humidity, min_humidity, max_humidity, target_humidity_step, available_modes         |
| valve        | open, closed, opening, closing             | current_position                                                                                                                   |
| vacuum (2)   | idle, cleaning, paused, docked, returning  |                                                                                                                                    |
| button       |                                            |                                                                                                                                    |
| remote       | on, off                                    |                                                                                                                                    |
| siren        | on, off                                    | Basic switching as an on/off outlet; tones and duration are not exposed                                                            |
| select       |                                            | options                                                                                                                            |
| media_player | on, off, play, pause, stop, previous, next |                                                                                                                                    |

(1) - Supported preset_modes: auto, low, medium, high.

(2) - The Apple Home crashes if the Rvc is inside the bridge. If you pair with Apple Home use the server mode in the config (it will create an autonomous device with its QR code in the Devices panel of the Home page) and disable or split all other entities that are not the rvc.

These domains are supported also like individual and split entities.

## Climate, humidifier and dehumidifier controls

Fan percentage commands respect HA `percentage_step` (or `speed_count` when available). A five-speed fan uses 20/40/60/80/100%; requests snap to the nearest supported speed (ties round up), positive requests stay on, and 0 turns it off. Matter Step commands move one actual speed at a time and honor wrap/lowest-off options. Controller sliders may still show every percentage; HA feedback synchronizes the accepted speed. Missing or invalid step metadata retains continuous percentage control. Restart the plugin after changing speed capabilities.

Climate temperature commands respect Home Assistant `min_temp`, `max_temp`, and `target_temp_step` (including 0.5° and 1° increments), in the entity temperature unit. Unsupported increments are rounded to a supported target and reflected back to Matter. Controller apps may still display their own temperature increment. HA target changes also synchronize while off; stale range targets do not overwrite a single target.

Climate entities expose their integration-defined `preset_modes` and `fan_modes` as separate Matter Mode Select controls named **Preset** and **Fan mode**. Labels such as `eco`, `sleep`, `Quiet`, or `Turbo` are preserved and commands call `climate.set_preset_mode` or `climate.set_fan_mode`. Standard low/medium/high/auto fan modes also retain the Fan Control cluster. An unknown fan mode does not overwrite the reported fan state with Off. Current humidity is exposed as a humidity sensor when the attribute exists.

Home Assistant uses the [`humidifier` domain for both humidifiers and dehumidifiers](https://developers.home-assistant.io/docs/core/entity/humidifier/). Both are now discoverable as device, individual, and split entities. By default (`humidifierDeviceType: "compatible"`), they are represented by an on/off outlet and optional humidity sensor for controller compatibility. The Home Assistant friendly name is retained; name the entity accordingly to distinguish humidification from dehumidification in your controller.

- **Mode** preserves `available_modes` and calls `humidifier.set_mode`; this includes presets or speed-like modes supplied by the integration.
- **Target humidity** calls `humidifier.set_humidity` and shows percentage choices within `min_humidity`/`max_humidity`, respecting `target_humidity_step` (default 1%). It is added only when the `humidity` attribute is present and its range fits at most 255 choices.
- The standard humidifier API has no fan-speed service. If the integration supplies a separate `fan` or `select` entity for speed, enable that entity as well. Arbitrary humidifier `fan_mode` attributes are not sent to an invented service.

Mode Select visibility depends on your Matter controller. These controls do not guarantee a thermostat preset menu or a native humidity slider in every app. Supported labels must be unique, nonempty, at most 64 UTF-8 bytes each, with at most 255 options. Option IDs remain stable while running; reordered Home Assistant lists still select the original label. Removed options and unavailable devices are rejected, and newly added options require restarting the plugin. HA state changes update the selected mode without sending service commands back to HA.

## Experimental native humidity type

**Apple Home:** Compatible mode exposes an outlet and humidity sensor, not a native humidifier control. The experimental Matter Humidity Conditioner type does not guarantee Apple Home Humidifier support. Apple Home's HomeKit humidifier service and the provisional Matter type are different protocols. For an Apple Home humidifier/dehumidifier control, Home Assistant's [HomeKit Bridge](https://www.home-assistant.io/integrations/homekit/) supports `humidifier` entities; this is a separate bridge, not a mode implemented by this Matter plugin.

In the Matterbridge frontend, open **Plugins → matterbridge-hass → Plugin config** (gear icon), then **Humidifier / Dehumidifier Matter type**. Select **Compatible (default)**, **Native: Humidifier (cold mist) / Dehumidifier (experimental)**, or **Native: Humidifier (warm mist) / Dehumidifier (experimental)**, save, and restart the plugin. This is a plugin-wide setting; it is not an immediate device command. Select Compatible and restart again to return to the existing mapping. No manual JSON edit is required.

Set `humidifierDeviceType` to `native-cold-mist` or `native-warm-mist` to opt into the provisional **Humidity Conditioner (0x007D, revision 1)** with **Humidistat (0x0205, revision 1)** and non-lighting On/Off (Dead Front Behavior). Choose the actual mist type of your humidifier; Home Assistant does not expose it generically. For `device_class: dehumidifier`, either native selection exposes dehumidification without mist features. The default remains `compatible`.

Setpoint normalization and feature-gated command handling follow the [CHIP Humidistat server](https://github.com/project-chip/connectedhomeip/blob/master/src/app/clusters/humidistat-server/HumidistatCluster.cpp). The implementation follows the upstream CHIP [Humidity Conditioner definition](https://github.com/project-chip/connectedhomeip/blob/master/examples/all-devices-app/all-devices-common/device/types/humidity-conditioner/HumidityConditioner.cpp) and [provisional Humidistat schema](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/humidistat-cluster.xml). This is an experimental mapping, not a certified or finalized Matter device implementation; controllers may not recognize the new type. Changing device types may require rediscovery or re-pairing.

Native mode requires an explicit humidifier/dehumidifier `device_class`, valid integer percentage limits, step and target. Native selection never silently becomes an outlet: invalid metadata stops registration of that entity with a diagnostic. Correct its HA metadata or explicitly select Compatible. The maximum-minus-minimum range must be divisible by the step. Native targets are exposed directly through Humidistat instead of the target Mode Select child; integration-specific Mode presets remain available. SetSettings and writable targets reject out-of-range values and snap in-range values to the nearest step (ties round down), forward `humidifier.set_humidity`, and propagate service errors. Only the actual humidifying/drying action reports active operation; other states report Idle. Auto, continuous, sleep and optimal modes are not advertised. Unsupported Mode values return ConstraintError; SetSettings fields for absent optional features are ignored, matching the CHIP reference implementation.

## Fans and air circulators

Home Assistant `fan` entities, including air circulators, use the standard **Fan (0x002B, revision 4)** type with Identify, Groups and Fan Control. Optional features follow `supported_features`, with attribute-based detection only when that bitmask is absent: Step for speed control, Rocking for oscillation, Airflow Direction for direction, and Auto for an advertised `auto` preset. Generic HA oscillation retains the RockRound mapping; it does not imply separate horizontal and vertical controls.

Wind is exposed only for `sleep_wind`/`natural_wind` presets when a manual mode or speed can restore normal operation. Wind writes call `fan.set_preset_mode`; clearing wind restores the current manual percentage or a supported normal preset. Simultaneous sleep and natural wind is rejected because HA accepts one preset at a time. HA feedback updates wind attributes without issuing another service call.

## Energy meters

Energy meters use Home Assistant `sensor` entities: `device_class: energy` with `state_class: total` or `total_increasing` maps to Matter cumulative imported energy. Power, voltage and current map to the Electrical Power Measurement cluster. Wh/kWh/MWh and J/kJ/MJ/GJ are converted to Matter milliwatt-hours; W/kW, V and A are converted to the corresponding milli-units. Invalid values, negative cumulative energy, unknown units and unsafe numeric overflow are ignored so they do not replace the last valid reading.

These are live measurements, not a replicated HA Energy dashboard: tariffs, cost calculations and historical charts are not transferred. Import/export direction is not inferred from entity names, and exported-energy counters are not currently mapped to `cumulativeEnergyExported`. When one HA device has several energy counters (daily, lifetime, multiple channels), select one per device or put additional counters in `splitEntities` to avoid sharing the same Matter attribute. Controller support determines whether energy measurements are displayed.

## Supported individual entities:

| Domain        | Category    |
| ------------- | ----------- |
| automation    | Automations |
| scene         | Scenes      |
| script        | Scripts     |
| input_boolean | Helpers     |
| input_button  | Helpers     |
| input_select  | Helpers     |

These individual entities are exposed as on/off outlets. When the outlet is turned on, it triggers the associated entity. After triggering, the outlet automatically switches back to the off state. The helper of domain input_boolean maintains the on/off state.

These domains are supported also like device entities and split entities.

## Supported sensors:

| Domain | Supported state class   | Supported device class     | Unit                                                                      | Matter device type |
| ------ | ----------------------- | -------------------------- | ------------------------------------------------------------------------- | ------------------ |
| sensor | measurement             | temperature                | °C, °F                                                                    | temperatureSensor  |
| sensor | measurement             | humidity                   | %                                                                         | humiditySensor     |
| sensor | measurement             | pressure                   | inHg, hPa, kPa                                                            | pressureSensor     |
| sensor | measurement             | atmospheric_pressure       | inHg, hPa, kPa                                                            | pressureSensor     |
| sensor | measurement             | illuminance                | lx                                                                        | lightSensor        |
| sensor | measurement             | battery (3)                | %                                                                         | powerSource        |
| sensor | measurement             | voltage (battery) (3)      | mV                                                                        | powerSource        |
| sensor | measurement             | voltage                    | mV, V, kV                                                                 | electricalSensor   |
| sensor | measurement             | current                    | mA, A                                                                     | electricalSensor   |
| sensor | measurement             | power                      | mW, W, kW, MW                                                             | electricalSensor   |
| sensor | total, total_increasing | energy                     | Wh, kWh, MWh, J, kJ, MJ, GJ                                               | electricalSensor   |
| sensor | measurement             | volume_flow_rate           | m³/h, m³/min, m³/s, L/h, L/min, L/s, mL/s, ft³/min, gal/d, gal/h, gal/min | flowSensor         |
| sensor | measurement             | aqi (1)                    |                                                                           | airQualitySensor   |
| sensor | measurement             | volatile_organic_compounds | ugm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | carbon_dioxide             | ppm (2)                                                                   | airQualitySensor   |
| sensor | measurement             | carbon_monoxide            | ppm (2)                                                                   | airQualitySensor   |
| sensor | measurement             | nitrogen_dioxide           | ugm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | ozone                      | ugm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | formaldehyde               | mgm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | radon                      | bqm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | pm1                        | ugm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | pm25                       | ugm3 (2)                                                                  | airQualitySensor   |
| sensor | measurement             | pm10                       | ugm3 (2)                                                                  | airQualitySensor   |

(1) - If the air quality entity is not standard (e.g. state class = measurement, device class = aqi and state number range 0-500), it is possible to set a regexp. See below.

(2) - On the controller side.

(3) - Must be an entity that belongs to a device. Battery alone is not a device in Matter.

Non-energy measurement sensors also work without `state_class` (statistics metadata).
Pressure additionally accepts Pa, bar, mbar, mmHg, and psi. Electrical measurements are converted to Matter integer milli-units, and flow to tenths of m³/h. Unsupported units, non-finite measurements, and out-of-range flow values are rejected rather than guessed.

### Compatibility expansion status

Manual fan percentage feedback now updates both Matter `percentCurrent` and
`percentSetting`. If HA rounds a request such as 29% to a supported 20% step,
the setting follows HA's accepted value. Percentage service completion also
reconciles the latest HA cache when the accepted value was already current and
HA emits no state-change event. Older service completions do not override a newer
pending percentage request. Auto and unrecognized presets retain separate speed
telemetry; only no preset or low/medium/high/manual/normal/favorite/favourite
presets synchronize the manual target. Unavailable and invalid readings do not
fabricate a speed. This needs the rebuilt plugin installed and restarted;
Apple Home display behavior still needs verification on the paired controller.

The additional mappings are covered by automated tests, including Matter endpoint initialization, using Matterbridge 3.10.10 and Node.js 24.14.0. Physical Home Assistant devices and controller pairing still require deployment-specific validation. This is not a claim of full Matter device-type coverage or CHIP certification.

- Vacuum ServiceArea selection stores areas; changing RVC run mode to Cleaning starts `vacuum.clean_area` for the selection. An empty selection uses `vacuum.start`. Home Assistant must advertise CLEAN_AREA and support the selected area IDs. Map images are available in the plugin web dashboard described below; map pixels and per-area progress are not transported over Matter. Invalid or ambiguous area registries disable ServiceArea with a warning instead of preventing the vacuum from initializing.
- Climate fan control maps the standard `low`, `medium`, `high`, and `auto` names. Integration-specific aliases and percentage control are not implemented. Unsupported fan mode writes do not turn off the thermostat.
- Media volume is an additional LevelControl cluster on the existing media endpoint, not a separate Matter Speaker device. Controller discovery and mute semantics still need a dedicated implementation.
- Covers exposing both SET_POSITION and SET_TILT_POSITION receive lift/tilt positioning. Tilt-only devices are not yet supported.
- Light effects use ModeSelect with stable advertised labels even if Home Assistant reorders its effect list. Removed effects are ignored; new effects require rebuilding the endpoint.

Development dependencies are pinned in `package-lock.json`, including Matterbridge. Use `npm ci` with a supported Node.js version (`nvm use` selects the checked-in development version), then `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test`. Do not run `npm run link` unless intentionally testing a different global Matterbridge checkout: it replaces the pinned local development dependency. `npm run softReset` now preserves the local dependency rather than linking a potentially incompatible global installation.

Protocol reference: [connectedhomeip data model](https://github.com/project-chip/connectedhomeip/tree/master/data_model). Home Assistant units and capabilities follow the [sensor](https://developers.home-assistant.io/docs/core/entity/sensor/) and [cover](https://developers.home-assistant.io/docs/core/entity/cover/) entity contracts.

## Supported binary_sensors:

| Domain        | Supported device class (1)                    | Matter device type  |
| ------------- | --------------------------------------------- | ------------------- |
| binary_sensor | window, garage_door, door, opening, vibration | contactSensor       |
| binary_sensor | motion, occupancy, presence                   | occupancySensor     |
| binary_sensor | cold                                          | waterFreezeDetector |
| binary_sensor | moisture                                      | waterLeakDetector   |
| binary_sensor | smoke                                         | smokeCoAlarm        |
| binary_sensor | carbon_monoxide                               | smokeCoAlarm        |
| binary_sensor | battery                                       | powerSource         |

(1) - A binary_sensor without a device class is exposed like a generic contactSensor.

## Supported events:

| Domain | Supported events                                         | Matter device type |
| ------ | -------------------------------------------------------- | ------------------ |
| event  | single, single_push, press, initial_press, multi_press_1 | genericSwitch      |
| event  | double, double_press, double_push, multi_press_2         | genericSwitch      |
| event  | long, long_push, long_press, hold_press                  | genericSwitch      |

If any commonly used integration use other useful events, let me know please.

### Naming issues explained

For the naming issues (expecially upsetting with Alexa) read the explanation and the three possible actual solutions [here](https://github.com/Luligu/matterbridge-hass/discussions/86).

### Usage warning

> **Warning:** Since this plugin takes the devices from Home Assistant, it cannot be paired back to Home Assistant. This would lead to duplicate devices! If you run Matterbridge like a Home Assistant Add-on and also use other plugins to expose their devices to Home Assistant, then change to child bridge mode and pair the other plugins to Home Assistant and this plugin wherever you need it.

## Sponsoring

If you like this project and find it useful, please consider giving it a **star** on [GitHub](https://github.com/Luligu/matterbridge-hass) and **sponsoring** it.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/assets/bmc-button.svg" alt="Buy me a coffee" width="120"></a>

## Prerequisites

### Matterbridge

See the complete guidelines on [Matterbridge](https://matterbridge.io) for more information.

## How to install the plugin

Just open the frontend, select the matterbridge-hass plugin and click on install. If you are using Matterbridge with `Docker`, all plugins are already loaded in the container so you just need to select the matterbridge-hass plugin and add it. If you are using Matterbridge with the `Matterbridge Home Assistant Application` (formerly known as add-on), you need to install the matterbridge-hass plugin.

## How to use it

There are 2 different source of Matter devices coming from matterbridge-hass plugin:

- Regular devices with their entities that use the main whiteList, blackList and deviceEntityBlackList. You find them in Home Assistant at http://homeassistant.local:8123/config/devices/dashboard.

- Individual entities with domain scene, script, automation. You find these special entities in Home Assistant at http://homeassistant.local:8123/config/automation/dashboard, http://homeassistant.local:8123/config/scene/dashboard and http://homeassistant.local:8123/config/script/dashboard.

- Individual entities (helpers) with domain input_boolean, input_button. You find these special entities in Home Assistant at http://homeassistant.local:8123/config/helpers.

- Individual entities from template. You find these special entities in Home Assistant at http://homeassistant.local:8123/config/helpers.

All the individual entities use the main whiteList, blackList.

Since the release 0.4.0 it is also possible to pickup any device entity and split ("decompose") it to make it an independent Matter device.

## Config

You may need to set some config values in the frontend (wait that the plugin has been configured before changing the config):

I suggest to always use the filters by Area and Label or the whiteList adding each entity or device you want to expose to Matter.

If any device or entity creates issues put it in the blackList.

### Host

Your Home Assistance address (eg. ws://homeassistant.local:8123 or ws://IP-ADDRESS:8123). Use the IP only if it is stable. It is also possible to use ssl websocket (i.e. wss://). If you use selfsigned certificates you need to provide either the ca certificate or to unselect rejectUnauthorized. With normal certificates you don't need ca certificate and rejectUnauthorized should be selected.

### Token

Home Assistant long term token used to connect to Home Assistant with WebSocket. Click on your user name in the bottom left corner of the Home Assistand frontend, then Security and create a Long-Lived Access Tokens.

### CA Certificate Path

Fully qualified path to the SSL ca certificate file. This is only needed if you use a self-signed certificate and rejectUnauthorized is enabled.

### Reject Unauthorized

Ignore SSL certificate errors. It allows to connect to Home Assistant with self-signed certificates without providing the ca certificate.

### Reconnect Timeout

Reconnect timeout in seconds.

### Reconnect Retries

Number of times to try to reconnect before giving up.

### Filter By Area

Filter devices and individual entities by area. If enabled, only devices, individual entities, and split entities in the selected area will be exposed. If disabled, all devices, individual entities, and split entities will be exposed. A device is also exposed if it has any entities that satisfy the filters.

### Filter By Label

Filter devices and individual entities by label. If enabled, only devices, individual entities, and split entities with the selected label will be exposed. If disabled, all devices, individual entities, and split entities will be exposed. A device is also exposed if it has any entities that satisfy the filters.

### Whitelist

If the whiteList is defined only the devices, the individual and split entities included are exposed to Matter. Use the device/entity name or the device/entity id.

### Blacklist

If the blackList is defined the devices, the individual and split entities included will not be exposed to Matter. Use the device/entity name or the device/entity id.

### Device Entity Blacklist

List of entities not to be exposed for a single device. Enter in the first field the name of the device and in the second field add all the entity names you want to exclude for that device.

### Domain Whitelist

Only entities whose domain is listed here will be exposed. Leave this list empty to expose all domains. Enter the domain name (i.e. switch, light, sensor).

### Domain Blacklist

Entities whose domain is listed here will be excluded. Leave this list empty to exclude no domains. Enter the domain name (i.e. automation, scene, button).

### Split Entities

> DEPRECATED: use `Split By Label`

The device entities in the list will be exposed like an independent device and removed from their device. Use the entity id (i.e. switch.plug_child_lock).

Let's make an example.

Suppose we have a device named "Computer plug" with 3 entities:

- id switch.computer_plug named "Computer plug Power" that is the main Power for the plug
- id switch.computer_plug_child_lock named "Computer plug Child lock" that is the child lock for the plug
- id temperature.computer_plug named "Computer plug Device temperature" that is the device temperature (very used in the zigbee world)

Without further setup, the controller will show 2 switch with the same name (difficult to distinguish them). Alexa will show 3 devices "Computer plug", "First plug" and "Second plug".

Solution:

- add switch.computer_plug_child_lock (use entity_id) to splitEntities and restart.
- if you use the whiteList, select your switch.computer_plug_child_lock (will show up with the entity name "Computer plug Child lock") and restart.

In this way, the controller will show one switch with name "Computer plug" and a second with name "Computer plug Child lock".

If you don't need the device temperature, just add it to deviceEntityBlackList.

If you want a more technical explanation for the naming issues (expecially upsetting with Alexa) read the explanation [here](https://github.com/Luligu/matterbridge-hass/discussions/86).

> **Adding an entity to splitEntities doesn't automatically add it to the whiteList, so it must be added manually if you use the whiteList.**

> **If you enable the filters (area and label), the split entity must also satisfy the filter criteria.**

### Split By Label

Any device entity with this label will be split. This is faster to setup then splitEntities on huge setups.

When a split vacuum has the same name as its already registered parent device, the plugin appends its entity ID to the Matter accessory name (for example, `Robot Vacuum (vacuum.robot_vacuum)`) instead of skipping it as a duplicate. HA names and label/selection matching remain unchanged. Vacuums without this collision keep their existing identity.

> **Adding splitByLabel to an entity doesn't automatically add it to the whiteList, so it must be added manually if you use the whiteList.**

> **If you enable the filters (area and label), the split entity must also satisfy the filter criteria.**

### Split Name Strategy

Strategy used for split entity names. "Entity name": use the entity name (i.e. Child Lock) if it exists; otherwise, use the friendly name. "Friendly name": use the friendly name (i.e. Computer Plug Child Lock) if it exists; otherwise, use the entity name. Changing this value will cause you to lose the device configuration in your controller, and you may need to pair the controller again.

### Controller Strategy

Strategy used to expose multiple device types. 'Merge' combines non-overlapping device types on the main endpoint. 'Matter' creates a separate endpoint for each device type. Use the Merge strategy for legacy controllers (more then one application device type on the same bridged endpoint is not strictly compliant in Matter 1.5.0). Changing this setting may require you to pair the controller again cause the entire node is composed differently.

### Air Quality Regex

Custom regex pattern to match air quality sensors that don't follow the standard Air Quality entity sensor.

**Examples:**

- For sensor entities ending with `_air_quality`: `^sensor\..*_air_quality$`.
- For sensor entities containing `air_quality` anywhere: `^sensor\..*air_quality.*$`.
- For a single specific entity: `sensor.air_quality_sensor` (exact entity ID).
- For two specific entities: `^(sensor\.kitchen_air_quality|sensor\.living_room_aqi)$`.

If your setup has only one air quality sensor, you can simply put the exact entity ID here (e.g., `sensor.air_quality_sensor`) and it will match that specific entity.

### Enable Server Rvc

Enable the Robot Vacuum Cleaner in server mode. Apple Home will crash unless you use this mode! Don't try it with Apple Home cause the bridge will become unstable even if you remove it after.

In addition to this well known bugs, the rvc must be a single device, it cannot have any other device types like switch or whatever. So if your integration adds any other device types, blacklist or split them.

In server mode, the plugin always promotes the vacuum to the main endpoint, for both `Merge` and `Matter` controller strategies (including individual and split entities). The advertised primary type is RoboticVacuumCleaner, even when battery metadata is present. Companion controls remain on separate child endpoints so their `changeToMode` handlers cannot capture vacuum commands. This does not change the vacuum name, serial number or unique ID. Map matching, including the default `_map` suffix, only selects dashboard images and does not filter vacuum registration.

### Discard Hidden Entities

If enabled (default), the plugin discards entities that are hidden in Home Assistant (i.e. entities whose `hidden_by` field is not `null` in the entity registry). Hidden entities will not be exposed as device entities, individual entities, or split entities.

### Apple Home Media Command Switches

Enable this option (`mediaPlayerControlsOnly`) and restart Matterbridge to expose
eligible `media_player` entities as command switches without their direct Matter
media-player endpoint. This avoids exposing the unsupported media device type to
Apple Home. No Virtual Control Label or per-player HA label assignment is needed.
Area, label, domain, device and entity filters still apply; do not blacklist the
media-player domain to enable this mode. Individual, device and split entities
follow the same behavior.

Only advertised commands are created: power, play/pause/stop, previous/next,
mute/unmute and volume steps. Mute and unmute send explicit `is_volume_muted`
arguments. Commands check current availability and features before execution.
Offline discovery, including restored/unknown states, uses the last known
capabilities when available; if none are known, bring the player online and
restart the plugin. Long or duplicate player names receive a stable suffix
within Matter's name limit. A failed control registration is logged without
preventing the remaining controls from registering.

The option defaults to off, preserving native media endpoints and existing
label-based controls. It applies to every controller using this bridge and does
not add a Now Playing tile, media browsing or AirPlay. Existing controllers may
retain a cached old accessory after the endpoint layout changes; restarting
cannot make the old media type supported.

### Virtual Control Label

Label used to enable virtual controls on entities. If set, the plugin creates one virtual control for each entity with the selected label. These virtual controls are intended for accessibility and let you send commands to entities that are not directly supported by the controller, such as `media_player.samsung_tv`, with simple voice-friendly switches. Virtual controls are exposed as switch entities: turning one on triggers the command, and the plugin automatically turns it off again afterward.

Supported virtual control domains:

| Domain       | Feature        | Service              | Virtual control       |
| ------------ | -------------- | -------------------- | --------------------- |
| media_player | TURN_ON        | TURN_ON              | Turn ON + name        |
|              | TURN_OFF       | TURN_OFF             | Turn OFF + name       |
|              | PLAY           | MEDIA_PLAY           | Play + name           |
|              | PAUSE          | MEDIA_PAUSE          | Pause + name          |
|              | STOP           | MEDIA_STOP           | Stop + name           |
|              | VOLUME_MUTE    | VOLUME_MUTE          | Mute + name           |
|              | VOLUME_STEP    | VOLUME_DOWN          | Volume Down + name    |
|              | VOLUME_STEP    | VOLUME_UP            | Volume Up + name      |
|              | PREVIOUS_TRACK | MEDIA_PREVIOUS_TRACK | Previous Track + name |
|              | NEXT_TRACK     | MEDIA_NEXT_TRACK     | Next Track + name     |
| select       |                |                      | name + all options    |
| input_select |                |                      | name + all options    |

Use this option to create simple voice-friendly switches like `Play TV`, `Pause TV`, or `Turn ON TV` for media_player domain: with Siri you can simply say `Hey Siri Play TV`.

Example:

Let's say you have a device named `Samsung TV` with a media_player entity `media_player.samsung_tv`.

If you set `Virtual Control Label` to `matterbridge-virtual` and assign that label to the media_player entity in Home Assistant, the plugin checks which media player features are supported and creates one virtual switch for each supported command.

For example:

- if the device supports `TURN_ON`, the plugin creates `Turn ON Samsung TV`
- if the device supports `TURN_OFF`, the plugin creates `Turn OFF Samsung TV`
- if the device supports `PLAY`, the plugin creates `Play Samsung TV`
- if the device supports `PAUSE`, the plugin creates `Pause Samsung TV`
- if the device supports `STOP`, the plugin creates `Stop Samsung TV`
- if the device supports `VOLUME_MUTE`, the plugin creates `Mute Samsung TV`
- if the device supports `VOLUME_STEP`, the plugin creates `Volume Down Samsung TV` and `Volume Up Samsung TV`
- if the device supports `PREVIOUS_TRACK`, the plugin creates `Previous Track Samsung TV`
- if the device supports `NEXT_TRACK`, the plugin creates `Next Track Samsung TV`

When you turn on one of these virtual switches, the plugin sends the corresponding `media_player` service command to that entity and then automatically turns the switch off again.

So, if your `Samsung TV` only supports `TURN_ON`, `TURN_OFF` and `VOLUME_STEP`, you will get these four virtual controls:

- `Turn ON Samsung TV`
- `Turn OFF Samsung TV`
- `Volume Down Samsung TV`
- `Volume Up Samsung TV`

### Enable Debug

Should be enabled only if you want to debug some issue using the log.

## Style guide

See also the [Style Guide](./STYLEGUIDE.md) for JSDoc, naming, and logging conventions used in this repository.

## Repository toolchain

### Automatic GitHub releases

Every push to `master` or `main` runs `.github/workflows/release.yml`. It reads `version` from `package.json` and creates a GitHub Release with a `v`-prefixed tag (for example, `1.6.0` becomes `v1.6.0`) at the pushed commit, with automatically generated release notes. Increment this package version before pushing a new release. The version must be valid SemVer; versions such as `1.1.0-beta.1` produce prereleases.

The workflow builds the plugin and uses `npm pack` to attach an installable `matterbridge-hass-<version>.tgz` under release Assets. The archive includes compiled JavaScript, type declarations, plugin config/schema and the checked-in frontend files. The tarball preserves the version in `package.json`; the `version` in `matterbridge-hass.config.json` is not used for releases. Runtime dependencies are installed by npm when installing the archive and are not bundled, so installation requires registry access.

Download the `.tgz` asset (not GitHub’s source-code archive), then install it with `npm install -g ./matterbridge-hass-<version>.tgz`, or upload it through Matterbridge’s plugin installation UI.

The release job runs on `ubuntu-24.04`. When the version tag does not exist, it automatically creates `refs/tags/v<version>` at the pushed commit before creating the release. New releases remain drafts until the tarball upload succeeds. Rerunning a failed workflow retries the upload; a published release that already has the tarball is skipped. An existing release missing its asset can receive it only from the same tagged commit. Existing tags on another commit cause a failure: bump the package.json version for a new release. The workflow uses the built-in `GITHUB_TOKEN` with `contents: write` and needs no additional secret. It does not publish to npm or trigger the existing release-event npm workflow. Build and package-content validation must succeed before release creation; test CI runs separately.

> **Note:** This repository uses a new toolchain. It replaces the traditional TypeScript / ESLint / Prettier / Jest stack with a faster and lighter setup.

- **No `typescript 6.x` package** — replaced by [TypeScript Native 7.x](https://github.com/microsoft/typescript-go).
- **No ESLint, no Prettier** — replaced by the [oxc](https://oxc.rs) stack: [oxlint](https://oxc.rs/docs/guide/usage/linter.html) for linting and [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) for formatting.
- **No Jest** — replaced by [Vitest](https://vitest.dev), which is much faster and natively supports ESM without extra configuration.
- **Far fewer development dependencies** — the number of installed packages drops from **~600** to **~75**. A clean install is much faster.
- **Much faster linting and formatting** — oxlint and oxfmt run in a fraction of the time required by the ESLint / Prettier pipeline.
- **Much faster builds** — tsgo compiles the project in a fraction of the time required by the standard `tsc` build.
- **Editor support** — use the VS Code extensions for tsgo and oxc to get the same experience in the editor.

## Copilot instructions

| File                                                                   | Notes                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `.github/copilot-instructions.md`                                      | Main project instructions — always loaded                                          |
| `.github/instructions/chip-tests/chip-tests.instructions.md`           | CHIP conformance test harness — scoped to CHIP test files                          |
| `.github/instructions/matterbridge/matterbridge.instructions.md`       | Matterbridge endpoint guide — dedicated Copilot instruction file                   |
| `.github/instructions/plugin-frontend/plugin-frontend.instructions.md` | Plugin frontend SPA and custom REST API guide — scoped to frontend and plugin code |
| `.github/instructions/testing/unit-tests.instructions.md`              | Testing standards — scoped to `**/*.test.ts`                                       |

## Claude instructions

| File                                                            | Notes                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                     | Main project instructions — always loaded                                          |
| `.claude/rules/chip-tests/chip-tests.instructions.md`           | CHIP conformance test harness — scoped to CHIP test files                          |
| `.claude/rules/matterbridge/matterbridge.instructions.md`       | Matterbridge endpoint guide — loaded for all contexts                              |
| `.claude/rules/plugin-frontend/plugin-frontend.instructions.md` | Plugin frontend SPA and custom REST API guide — scoped to frontend and plugin code |
| `.claude/rules/testing/unit-tests.instructions.md`              | Testing standards — scoped to `**/*.test.ts`                                       |

## Codex/Agents instructions

| File                         | Notes                                             |
| ---------------------------- | ------------------------------------------------- |
| `AGENTS.md`                  | Main project instructions                         |
| `.agents/chip-tests.md`      | CHIP conformance test harness                     |
| `.agents/matterbridge.md`    | Matterbridge endpoint guide                       |
| `.agents/plugin-frontend.md` | Plugin frontend SPA and custom REST API guide     |
| `.agents/testing.md`         | Testing and validation expectations               |
| `.codex/config.toml`         | Codex project permissions, approvals, and profile |
| `.codex/rules/default.rules` | Codex command allow, prompt, and deny rules       |

## Development guide

Refer to the Matterbridge [Development guide](https://matterbridge.io/README-DEV.html) for other guidelines.

---

### Vacuum maps and Xiaomi Home (MIoT) controls

Open the plugin frontend from Matterbridge, or visit `/plugins/matterbridge-hass/` on your Matterbridge server. The dashboard lists vacuum entities selected by this plugin, offers supported start/resume, pause, stop, dock, locate, spot-clean and fan-speed controls, and displays same-device sensors, select entities and action buttons. Xiaomi Home exposes MIoT properties/actions through these HA entities, so labels and choices come from your actual integration rather than model-specific hardcoded MIoT IDs. Disabled/hidden companion entities are excluded. A successful command means HA accepted the service call; device state is updated separately.

The dashboard requests images every 10 seconds while visible. It offers `image` and `camera` entities attached to the vacuum's HA device as map sources. In **Matterbridge → Plugins → matterbridge-hass → Settings**, set **Vacuum Map Regex**, just like Air Quality Regex, for example `^(image|camera)\..*(live_map|vacuum_map)$`. With exactly one selected vacuum this finds matching entities on a separate Xiaomi Cloud Map Extractor device as well. With multiple vacuums the regex does not guess associations across devices. The default (also when empty) is `^(image|camera)\..*_map$`: map entities ending in `_map` are preferred, including separate map devices when only one vacuum is selected. If no default match exists, same-device discovery is retained. Invalid patterns are logged and ignored. Restart the plugin after saving settings.

For multiple vacuums or an exact override, use **Vacuum Map Entities** in the same Settings screen (key = vacuum entity ID, value = map entity ID). The equivalent configuration is:

```json
"vacuumMapEntities": {
  "vacuum.my_xiaomi": "camera.my_xiaomi_map"
}
```

Use your actual entity IDs. This mapping takes precedence over automatic discovery. The image source must already work in Home Assistant. The server retrieves the image using the existing HA credentials and TLS configuration; tokens and image access URLs are not sent to the browser. Requests are restricted to HA's image/camera proxy endpoints, reject redirects, and are bounded to 8 MiB and 10 seconds.

Paths, cleaned zones and room labels are retained from the source image. Robot position can also be overlaid from calibrated map attributes as described below. Same-device sensors show room/status/progress when provided by the integration. The dashboard does not invent coordinates or decode proprietary map payloads. Calibrated position overlays and opt-in point navigation are described below; zone drawing is not implemented. The displayed image receipt time is not the robot's measurement time. Upstream image refresh may be slower than dashboard polling. Protect the Matterbridge frontend with its normal access controls because the page exposes device controls and floor plans.

Xiaomi protocol findings (checked September 2026):

- [Official Xiaomi Home](https://github.com/XiaoMi/ha_xiaomi_home) uses MIoT-Spec-V2. It supports cloud commands, central-hub local control, and optional LAN control for compatible IP devices. Its documentation cautions that LAN control can cause abnormalities. The plugin reuses this HA integration's chosen transport; it does not establish a second Xiaomi login or direct robot socket.
- [Xiaomi Home vacuum implementation](https://github.com/XiaoMi/ha_xiaomi_home/blob/main/custom_components/xiaomi_home/vacuum.py) exposes standard vacuum actions and fan levels. This does not guarantee a map image: a model-compatible map integration is needed if no image/camera entity exists. `xiaomi_home` and the third-party `xiaomi_miot` integration are distinct.
- [Xiaomi Miio](https://www.home-assistant.io/integrations/xiaomi_miio/) has model-specific zone, segment, coordinate and remote-control actions. Compatibility must be verified using the exact hardware model (for example `xiaomi.vacuum.…`); these actions and MIoT service/action IDs cannot safely be assumed for all Xiaomi-branded robots.

No new robot firmware, LAN-control setting or HA integration is installed automatically. Real-device map availability and action execution require validation with your model and HA setup.

MIoT JSON sensors containing `rooms`, `map_array` and `user_labels` are displayed as room names, map labels and saved preset room lists. These describe rooms and presets rather than a reconstructed floor plan; opt-in command bindings can enable room/preset actions. `map_uid`, `map_id` and room IDs are not interchangeable.

For `xiaomi.vacuum.d102gl` (X20 Pro), keep an existing Xiaomi Cloud Map Extractor live image as the map source. A [model-specific protocol investigation](https://github.com/AldenDana/ha-xiaomi-vacuum-x20pro/blob/master/docs/METHOD.md) reports room cleaning and preset actions, with firmware-dependent acknowledgement and payload quirks. These findings are not validation of this user's firmware. This dashboard uses standard HA services and configurable Virtual Layer command bindings; it does not replay raw model-specific RPCs directly. A map/trajectory `obj_name` is an object identifier, not an image URL or a robot position.

#### Using a Virtual Layer robot vacuum

When using `home-assistant-virtual-layer`, select the virtual `vacuum.*` entity in this plugin. All dashboard commands target that entity, so Virtual Layer's configured Command actions remain responsible for forwarding them to the real Xiaomi/MIoT vacuum. A source reference does not cause this plugin to bypass Virtual Layer. Configure those actions in the Virtual Layer UI; an optimistic virtual state change alone does not confirm physical robot execution.

Keep the virtual map `image.*` or `camera.*` on the same Virtual Layer Device for automatic discovery. A Virtual Layer camera alias of a raster map image can be used through the camera proxy too. If the map remains on a different Device, use **Vacuum Map Regex** (one selected vacuum) or **Vacuum Map Entities** (explicit association); the mapping key is the virtual vacuum ID. Select/button controls and sensors must be on the virtual Device to appear as companions. Generated battery sensors are shown in the sensor list, and `battery_level` is displayed when the virtual vacuum provides it.

The dashboard follows the virtual entity's live `supported_features` and `fan_speed_list`, including `clean_spot` when advertised. Arbitrary `send_command` payloads and `clean_area` are not inferred from Virtual Layer's default feature set. The map must supply raster image bytes; generic SVG polygon maps are not supported by this image proxy.

#### Robot position and advanced Virtual Layer controls

The selected map's attributes can now provide a robot marker, current room and coordinates. Enable/expose `vacuum_position` (`{x,y}`), `vacuum_room_name` or `vacuum_room`, `calibration_points`, and `image` on your map source. The [Map Extractor source](https://github.com/PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor/blob/master/custom_components/xiaomi_cloud_map_extractor/common/map_data.py) defines calibration as three `{vacuum:{x,y},map:{x,y}}` pairs; `image` supplies `width`, `height`, `scale`, and `rotation` (0/90/180/270). Coordinates retain the source's units; the bridge does not assume millimetres.

Use the original map image, or a Virtual Layer alias that preserves these attributes and the exact image geometry. A resized/letterboxed camera image needs its own transformed calibration and image dimensions. The browser suppresses markers/navigation when intrinsic image dimensions disagree. Position text remains available without calibration. Data older than 120 seconds is labelled stale and cannot be used for navigation. HA `last_updated` is the freshness signal, not a guarantee of when the robot measured its location.

In plugin **Settings → Vacuum Control Bindings**, add the virtual vacuum ID and only the commands actually handled by its Virtual Layer `send_command` action:

| Setting       | Example command name | Delivered `params`                                           |
| ------------- | -------------------- | ------------------------------------------------------------ |
| `goTo`        | `go_to`              | `{ "x": 250, "y": 750 }` in vacuum coordinates               |
| `cleanRooms`  | `clean_rooms`        | `{ "rooms": [60, 62] }` using current MIoT room IDs          |
| `startPreset` | `start_preset`       | `{ "preset_id": 1120474997 }` using the full saved preset ID |

The names above are a **configurable Virtual Layer contract**, not Xiaomi protocol commands. Leave unsupported actions empty. The bridge exposes these actions only on `virtual_layer` vacuum entities advertising `SEND_COMMAND`. In Virtual Layer Command actions, route `send_command` to your verified device action/script. Use `command_data.command` for the configured command name and `command_data.params` for its parameters; the action engine's top-level `command` variable is the method name `send_command`. Forwarding or recording an unknown command by itself does not implement robot navigation. A successful HA service response is not physical execution confirmation. Use the reported activity/location to verify execution; the bridge does not retry motion commands automatically.

On the dashboard, click the map to select a destination, then press **선택 위치로 이동**. Image pixels are converted to vacuum coordinates on the server. Current map revision, freshness, dimensions and calibration are rechecked before dispatch. New map metadata invalidates a pending destination. Room checkboxes and saved preset buttons appear when their bindings and metadata are available. Empty/unknown/duplicate room selections, unknown presets and obsolete room/map revisions are rejected. Room IDs are not HA area IDs. No actual robot commands are sent during startup, discovery, or automated tests.

#### Vacuum availability and Apple Home

A bridged vacuum's reachability follows its registered `vacuum.*` state, not optional battery/diagnostic companions. An unavailable companion no longer marks a healthy vacuum unreachable, and a healthy companion does not hide an unavailable vacuum. Unknown/missing vacuum states preserve the last reachability value until a definite state arrives. Standalone RVC server endpoints do not have `BridgedDeviceBasicInformation.reachable`; the plugin skips that attribute instead of writing a nonexistent cluster.

These changes address availability handling, not every cause of Apple Home “No Response”. If HA is healthy but Apple Home is not, check Matterbridge's RVC registration/error logs and the standalone RVC server's connectivity after restarting the updated plugin. Keep `enableServerRvc` enabled for the existing Apple Home setup. Do not delete pairing data to diagnose the issue. Existing warnings about additional non-vacuum endpoints on a server-mode RVC still require inspection; map/dashboard discovery itself does not add Matter camera endpoints.
