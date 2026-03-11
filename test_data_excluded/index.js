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
  getMockDispatches: (DateTime, timeZone) => {
    // Recreate the "today" logic here so the controller doesn't have to
    const today = DateTime.now().setZone(timeZone).set({ second: 0, millisecond: 0 });
    return {
      d00000000_0009_4000_8020_00000007b8d2: [
        {
          end: today.set({ hour: 12, minute: 50 }).toISO(),
          energyAddedKwh: -11.618,
          start: today.set({ hour: 12, minute: 36 }).toISO(),
          type: "BOOST"
        },
        {
          end: today.set({ hour: 15, minute: 30 }).toISO(),
          energyAddedKwh: -11.618,
          start: today.set({ hour: 13, minute: 56 }).toISO(),
          type: "SMART"
        },
        {
          end: today.set({ hour: 17, minute: 30 }).toISO(),
          energyAddedKwh: -11.618,
          start: today.set({ hour: 16, minute: 15 }).toISO(),
          type: "BOOST"
        },
        {
          end: today.set({ hour: 19, minute: 0 }).toISO(),
          energyAddedKwh: -3.417,
          start: today.set({ hour: 18, minute: 15 }).toISO(),
          type: "SMART"
        },
        {
          end: today.set({ hour: 19, minute: 45 }).toISO(),
          energyAddedKwh: -3.417,
          start: today.set({ hour: 19, minute: 10 }).toISO(),
          type: "SMART"
        },
        {
          end: today.plus({ days: 1 }).set({ hour: 6, minute: 0 }).toISO(),
          energyAddedKwh: -70.3,
          start: today.set({ hour: 20, minute: 0 }).toISO(),
          type: "SMART"
        }
      ],
      d00000000_000a_4000_8020_0d0000040af2: null
    };
  }
};