import { describe, expect, it } from 'vitest';
import { calculatePlan, clonePlan, convertPlanUnit, makeDefaultPlan, validatePlan } from '../src/model';

describe('RouteCost calculations', () => {
  it('aggregates multiple legs, doubles only route energy, and splits the total', () => {
    const plan = makeDefaultPlan();
    plan.legs = [
      { id: 'a', name: 'A', distance: 100 },
      { id: 'b', name: 'B', distance: 50 },
    ];
    plan.roundTrip = true;
    plan.gas = { efficiency: 10, price: 2 };
    plan.tolls = 20;
    plan.parking = 10;
    plan.lodgingNights = 1;
    plan.lodgingPerNight = 100;
    plan.foodPerPersonPerDay = 10;
    plan.tripDays = 2;
    plan.people = 2;
    plan.activities = 15;
    plan.bufferPercent = 10;

    const result = calculatePlan(plan);

    expect(result.complete).toBe(true);
    expect(result.distanceOneWay).toBe(150);
    expect(result.distanceTotal).toBe(300);
    expect(result.energyUsed).toBeCloseTo(30);
    expect(result.energyCost).toBeCloseTo(60);
    expect(result.fixedExtras).toBeCloseTo(185);
    expect(result.subtotal).toBeCloseTo(245);
    expect(result.bufferAmount).toBeCloseTo(24.5);
    expect(result.total).toBeCloseTo(269.5);
    expect(result.perPerson).toBeCloseTo(134.75);
    expect(result.legs.map((leg) => leg.distance)).toEqual([200, 100]);
  });

  it('supports EV assumptions and per-kWh pricing', () => {
    const plan = makeDefaultPlan();
    plan.roundTrip = false;
    plan.legs = [{ id: 'a', name: 'Coast', distance: 200 }];
    plan.vehicleMode = 'ev';
    plan.ev = { efficiency: 20, price: 0.3 };
    plan.tolls = plan.parking = plan.lodgingNights = plan.lodgingPerNight = plan.foodPerPersonPerDay = plan.activities = 0;
    plan.bufferPercent = 0;

    const result = calculatePlan(plan);

    expect(result.complete).toBe(true);
    expect(result.energyUnit).toBe('kWh');
    expect(result.energyUsed).toBeCloseTo(40);
    expect(result.energyCost).toBeCloseTo(12);
    expect(result.total).toBeCloseTo(12);
  });

  it('converts units without changing the calculated energy cost', () => {
    const metric = makeDefaultPlan();
    const metricResult = calculatePlan(metric);
    const imperial = convertPlanUnit(metric, 'imperial');
    const imperialResult = calculatePlan(imperial);
    const backToMetric = convertPlanUnit(imperial, 'metric');

    expect(imperial.unitSystem).toBe('imperial');
    expect(imperial.legs[0].distance).toBeCloseTo(metric.legs[0].distance / 1.609344, 8);
    expect(imperialResult.distanceTotal).toBeCloseTo(metricResult.distanceTotal / 1.609344, 8);
    expect(imperialResult.energyCost).toBeCloseTo(metricResult.energyCost, 5);
    expect(backToMetric.legs[0].distance).toBeCloseTo(metric.legs[0].distance, 8);
    expect(backToMetric.gas.price).toBeCloseTo(metric.gas.price, 8);
  });

  it('reports the selected vehicle errors but allows optional costs to be zero', () => {
    const plan = makeDefaultPlan();
    plan.legs = [{ id: 'empty', name: '', distance: 0 }];
    plan.gas.efficiency = 0;
    plan.gas.price = -1;

    expect(validatePlan(plan)).toEqual([
      'Add at least one route distance.',
      'Add a gas efficiency above zero.',
      'Enter a valid energy price.',
    ]);
    expect(calculatePlan(plan).complete).toBe(false);
  });

  it('clones nested plan values independently', () => {
    const original = makeDefaultPlan();
    const copy = clonePlan(original);
    copy.legs[0].distance = 999;
    copy.gas.price = 99;
    expect(original.legs[0].distance).not.toBe(copy.legs[0].distance);
    expect(original.gas.price).not.toBe(copy.gas.price);
  });
});
