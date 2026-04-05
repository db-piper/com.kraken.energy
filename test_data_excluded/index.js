'use strict';
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
            currentState: isAvailable ? "SMART_CONTROL_CAPABLE" : "SMART_CONTROL_NOT_AVAILABLE"
          }
        };
      }
      return device;
    });
  },
  getMockDispatches: (DateTime, timeZone) => {
    // Recreate the "today" logic here so the controller doesn't have to
    const today = DateTime.now().setZone(timeZone).set({ second: 0, millisecond: 0 });
    return {
      d00000000_0009_4000_8020_00000007b8d2: [
        {
          //PQ event at 11:30 and 12:00  COSY at normal price - both 11:30 PQ:0 and 12:00 PQ:2 events
          start: today.set({ hour: 11, minute: 36 }).toISO(),
          end: today.set({ hour: 11, minute: 50 }).toISO(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          //PQ event at 12:30 and 13:00 - 12:30 event PQ:0 but no event at 13:00 because COSY starts
          start: today.set({ hour: 12, minute: 36 }).toISO(),
          end: today.set({ hour: 12, minute: 50 }).toISO(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          //PQ event at 13:30 - but COSY pricing! - no events COSY throughout PQ:0
          start: today.set({ hour: 13, minute: 36 }).toISO(),
          end: today.set({ hour: 13, minute: 50 }).toISO(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          //Contigous EXTENDED dispatches - no events COSY throughout PQ:0
          start: today.set({ hour: 14, minute: 10 }).toISO(),
          end: today.set({ hour: 14, minute: 20 }).toISO(),
          energyAddedKwh: -11.618,
          type: "SMART"
        },
        {
          //PQ event at 15:00 and 15:30 - 15:00 PQ:3 - 15:30 PQ:0
          start: today.set({ hour: 15, minute: 10 }).toISO(),
          end: today.set({ hour: 15, minute: 25 }).toISO(),
          energyAddedKwh: -3.417,
          type: "BOOST"
        },
        { //PQ event at 16:00 and 16:30 - but COSY pricing at 16:00 PQ:0 - 16:30 PQ:3
          start: today.set({ hour: 16, minute: 10 }).toISO(),
          end: today.set({ hour: 16, minute: 25 }).toISO(),
          energyAddedKwh: -3.417,
          type: "SMART"
        },
        {
          //PQ event at 17:00 - none at 17:30 (contiguous with next) - 17:00 PQ:0, 17:30 None
          start: today.set({ hour: 17, minute: 10 }).toISO(),
          end: today.set({ hour: 17, minute: 25 }).toISO(),
          energyAddedKwh: -5.333,
          type: "SMART"
        },
        {
          //PQ event none at 17:30 (contiguous) - 18:00 PQ:3 - 17:30 None 18:00 PQ:3
          start: today.set({ hour: 17, minute: 30 }).toISO(),
          end: today.set({ hour: 17, minute: 50 }).toISO(),
          energyAddedKwh: -5.333,
          type: "SMART"
        }
      ],
      d00000000_000a_4000_8020_0d0000040af2: null
    };
  }
};