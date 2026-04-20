'use strict';
const dayjs = require('dayjs');

module.exports = {
  getMockDevices: () => [
    {
      "id": "00000000-0009-4000-8020-00000007b8d2",
      "name": "TEST Myenergi zappi (all models)",
      "status": {
        "current": "LIVE",
        "currentState": "SMART_CONTROL_CAPABLE",
        "isSuspended": false
      }
    },
    {
      "id": "00000000-000a-4000-8020-0d0000040af2",
      "name": null,
      "status": {
        "current": "LIVE",
        "currentState": "SMART_CONTROL_NOT_AVAILABLE",
        "isSuspended": false
      }
    }
  ],
  getMockDeviceStatuses: () => {
    const devices = [
      {
        "id": "00000000-0009-4000-8020-00000007b8d2",
        "status": { "currentState": "SMART_CONTROL_CAPABLE" }
      },
      {
        "id": "00000000-000a-4000-8020-0d0000040af2",
        "status": { "currentState": "SMART_CONTROL_NOT_AVAILABLE" }
      }
    ];

    return devices.map(device => {
      // Only target the specific device ending in 7b8d2
      if (device.id.endsWith('7b8d2')) {
        //const isAvailable = Math.random() < .7; // 70% chance for true
        const isAvailable = true;
        return {
          ...device,
          status: {
            ...device.status,
            currentState: isAvailable ? "SMART_CONTROL_IN_PROGRESS" : "SMART_CONTROL_NOT_AVAILABLE"
          }
        };
      }
      return device;
    });
  },
  getMockDispatches: (timeZone) => {
    const today = dayjs().tz(timeZone).set('second', 0).set('millisecond', 0);
    return {
      d00000000_0009_4000_8020_00000007b8d2: [
        {
          start: today.set({ hour: 11, minute: 36 }).toISOString(),
          end: today.set({ hour: 11, minute: 50 }).toISOString(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          start: today.set({ hour: 12, minute: 36 }).toISOString(),
          end: today.set({ hour: 12, minute: 50 }).toISOString(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          start: today.set({ hour: 13, minute: 36 }).toISOString(),
          end: today.set({ hour: 13, minute: 50 }).toISOString(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          start: today.set({ hour: 14, minute: 10 }).toISOString(),
          end: today.set({ hour: 14, minute: 20 }).toISOString(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          start: today.set({ hour: 15, minute: 10 }).toISOString(),
          end: today.set({ hour: 15, minute: 25 }).toISOString(),
          energyAddedKwh: -3.417,
          type: "BOOST"
        },
        {
          start: today.set({ hour: 16, minute: 10 }).toISOString(),
          end: today.set({ hour: 16, minute: 25 }).toISOString(),
          energyAddedKwh: -3.417,
          type: "SMART"
        },
        {
          start: today.set({ hour: 17, minute: 10 }).toISOString(),
          end: today.set({ hour: 17, minute: 25 }).toISOString(),
          energyAddedKwh: -5.333,
          type: "SMART"
        },
        {
          start: today.set({ hour: 17, minute: 30 }).toISOString(),
          end: today.set({ hour: 17, minute: 50 }).toISOString(),
          energyAddedKwh: -5.333,
          type: "SMART"
        }
      ],
      d00000000_000a_4000_8020_0d0000040af2: null
    };
  }
};