export const KM_PER_MILE = 1.609344;
export const LITRES_PER_GALLON = 3.785411784;
export const MILES_PER_KM = 1 / KM_PER_MILE;
export const MPG_FROM_L_PER_100KM = 235.214583;
export function makeDefaultPlan() {
    return {
        unitSystem: 'metric',
        vehicleMode: 'gas',
        compareVehicles: true,
        roundTrip: true,
        legs: [
            { id: 'leg-1', name: 'Main route', distance: 350 },
            { id: 'leg-2', name: 'Local exploring', distance: 80 },
        ],
        gas: { efficiency: 7.2, price: 1.9 },
        ev: { efficiency: 17.5, price: 0.32 },
        tolls: 35,
        parking: 24,
        lodgingNights: 2,
        lodgingPerNight: 145,
        foodPerPersonPerDay: 48,
        tripDays: 3,
        activities: 60,
        people: 2,
        bufferPercent: 10,
        currency: 'AUD',
    };
}
export function clonePlan(plan) {
    return {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg })),
        gas: { ...plan.gas },
        ev: { ...plan.ev },
    };
}
function positive(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
function nonNegative(value) {
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
function roundUp(value) {
    return Math.ceil(value - 1e-9);
}
function calculateEnergy(distance, plan, mode) {
    const settings = mode === 'gas' ? plan.gas : plan.ev;
    const efficiency = positive(settings.efficiency);
    const price = nonNegative(settings.price);
    if (!efficiency || !distance) {
        return { used: 0, cost: 0, unit: mode === 'gas' ? (plan.unitSystem === 'metric' ? 'L' : 'gal') : 'kWh' };
    }
    if (mode === 'gas') {
        const used = plan.unitSystem === 'metric' ? distance * efficiency / 100 : distance / efficiency;
        return { used, cost: used * price, unit: plan.unitSystem === 'metric' ? 'L' : 'gal' };
    }
    const used = plan.unitSystem === 'metric' ? distance * efficiency / 100 : distance / efficiency;
    return { used, cost: used * price, unit: 'kWh' };
}
export function validatePlan(plan) {
    const errors = [];
    const distance = plan.legs.reduce((sum, leg) => sum + positive(leg.distance), 0);
    if (!distance)
        errors.push('Add at least one route distance.');
    const vehicle = plan.vehicleMode === 'gas' ? plan.gas : plan.ev;
    if (!positive(vehicle.efficiency)) {
        errors.push(plan.vehicleMode === 'gas' ? 'Add a gas efficiency above zero.' : 'Add an EV efficiency above zero.');
    }
    if (!Number.isFinite(vehicle.price) || vehicle.price < 0)
        errors.push('Enter a valid energy price.');
    if (!Number.isFinite(plan.people) || plan.people < 1)
        errors.push('Use at least one traveller for the split.');
    if (!Number.isFinite(plan.tripDays) || plan.tripDays < 1)
        errors.push('Use at least one trip day.');
    if (!Number.isFinite(plan.lodgingNights) || plan.lodgingNights < 0)
        errors.push('Lodging nights cannot be negative.');
    if (!Number.isFinite(plan.bufferPercent) || plan.bufferPercent < 0 || plan.bufferPercent > 50) {
        errors.push('Keep the budget cushion between 0% and 50%.');
    }
    return errors;
}
export function calculatePlan(plan, mode = plan.vehicleMode) {
    const errors = validatePlan({ ...plan, vehicleMode: mode });
    const distanceOneWay = plan.legs.reduce((sum, leg) => sum + positive(leg.distance), 0);
    const multiplier = plan.roundTrip ? 2 : 1;
    const distanceTotal = distanceOneWay * multiplier;
    const energy = calculateEnergy(distanceTotal, plan, mode);
    const tolls = nonNegative(plan.tolls);
    const parking = nonNegative(plan.parking);
    const lodging = nonNegative(plan.lodgingNights) * nonNegative(plan.lodgingPerNight);
    const food = nonNegative(plan.foodPerPersonPerDay) * nonNegative(plan.tripDays) * Math.max(1, roundUp(plan.people));
    const activities = nonNegative(plan.activities);
    const fixedExtras = tolls + parking + lodging + food + activities;
    const subtotal = energy.cost + fixedExtras;
    const cushionRate = Math.min(50, Math.max(0, nonNegative(plan.bufferPercent))) / 100;
    const bufferAmount = subtotal * cushionRate;
    const total = subtotal + bufferAmount;
    const people = Math.max(1, roundUp(plan.people));
    const perPerson = total / people;
    const costPerDistance = distanceTotal ? total / distanceTotal : 0;
    const legResults = plan.legs.map((leg) => {
        const legDistance = positive(leg.distance) * multiplier;
        const legEnergy = calculateEnergy(legDistance, plan, mode);
        return {
            id: leg.id,
            name: leg.name.trim() || 'Route leg',
            distance: legDistance,
            energyUsed: legEnergy.used,
            energyCost: legEnergy.cost,
        };
    });
    return {
        complete: errors.length === 0,
        distanceOneWay,
        distanceTotal,
        energyUsed: energy.used,
        energyUnit: energy.unit,
        energyCost: energy.cost,
        fixedExtras,
        subtotal,
        bufferAmount,
        total,
        perPerson,
        costPerDistance,
        breakdown: [
            { key: 'energy', label: mode === 'gas' ? 'Fuel' : 'Charging', amount: energy.cost },
            { key: 'tolls', label: 'Tolls', amount: tolls },
            { key: 'parking', label: 'Parking', amount: parking },
            { key: 'lodging', label: 'Lodging', amount: lodging },
            { key: 'food', label: 'Food', amount: food },
            { key: 'activities', label: 'Activities', amount: activities },
            { key: 'buffer', label: `Budget cushion (${Math.round(cushionRate * 100)}%)`, amount: bufferAmount },
        ].filter((line) => line.amount > 0),
        legs: legResults,
        errors,
    };
}
export function convertPlanUnit(plan, nextUnit) {
    if (plan.unitSystem === nextUnit)
        return clonePlan(plan);
    const next = clonePlan(plan);
    if (nextUnit === 'imperial') {
        next.legs = next.legs.map((leg) => ({ ...leg, distance: leg.distance * MILES_PER_KM }));
        next.gas.efficiency = next.gas.efficiency ? MPG_FROM_L_PER_100KM / next.gas.efficiency : 0;
        next.gas.price = next.gas.price * LITRES_PER_GALLON;
        next.ev.efficiency = next.ev.efficiency ? 62.1371192 / next.ev.efficiency : 0;
        next.ev.price = next.ev.price;
    }
    else {
        next.legs = next.legs.map((leg) => ({ ...leg, distance: leg.distance * KM_PER_MILE }));
        next.gas.efficiency = next.gas.efficiency ? MPG_FROM_L_PER_100KM / next.gas.efficiency : 0;
        next.gas.price = next.gas.price / LITRES_PER_GALLON;
        next.ev.efficiency = next.ev.efficiency ? 62.1371192 / next.ev.efficiency : 0;
        next.ev.price = next.ev.price;
    }
    next.unitSystem = nextUnit;
    return next;
}
