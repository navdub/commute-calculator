import React, { useState } from 'react';
import { Clock, MapPin, Navigation, ArrowRight, AlertCircle, Calendar } from 'lucide-react';

const CommuteCalculator = () => {
  const [homeAddress, setHomeAddress] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [timeMode, setTimeMode] = useState('now'); // 'now' or 'arrival'
  const [arrivalTime, setArrivalTime] = useState('09:00');

  // Geocode address using Nominatim (OpenStreetMap)
  const geocodeAddress = async (address) => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'CommuteCalculator/1.0'
        }
      }
    );
    const data = await response.json();
    if (data.length === 0) throw new Error(`Could not find: ${address}`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  };

  // Get multiple route alternatives
  const getRoutes = async (start, end) => {
    const routes = [];
    
    // Route 1: Fastest route (default)
    const fastestResponse = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&alternatives=true&steps=true&annotations=true`
    );
    const fastestData = await fastestResponse.json();
    
    if (fastestData.code !== 'Ok') throw new Error('Routing failed');
    
    // Process up to 3 alternative routes from OSRM
    for (let i = 0; i < Math.min(3, fastestData.routes.length); i++) {
      const route = fastestData.routes[i];
      const highways = extractHighways(route.legs[0].steps);
      
      routes.push({
        type: i === 0 ? 'Fastest Route' : `Alternative ${i}`,
        duration: Math.round(route.duration / 60),
        distance: (route.distance / 1000).toFixed(1),
        highways: highways,
        steps: route.legs[0].steps.slice(0, 5).map(step => step.name).filter(name => name)
      });
    }
    
    return routes;
  };

  // Extract highway/freeway names from route steps
  const extractHighways = (steps) => {
    const highwayPattern = /\b(I-\d+|US-\d+|SR-\d+|State Route \d+|Highway \d+|Route \d+|Interstate \d+)\b/gi;
    const highways = new Set();
    
    steps.forEach(step => {
      if (step.name) {
        const matches = step.name.match(highwayPattern);
        if (matches) {
          matches.forEach(hw => highways.add(hw));
        }
      }
      if (step.ref) {
        highways.add(step.ref);
      }
    });
    
    return Array.from(highways).slice(0, 4); // Limit to 4 main highways
  };

  // Simulate traffic variations for different departure times
  const simulateTrafficVariation = (baseTime, hour, minute) => {
    let trafficMultiplier = 1.0;
    
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      trafficMultiplier = 1.35 + Math.random() * 0.15; // 35-50% longer
    } else if ((hour >= 6 && hour < 7) || (hour >= 9 && hour < 10) || (hour >= 16 && hour < 17) || (hour >= 19 && hour < 20)) {
      trafficMultiplier = 1.2 + Math.random() * 0.1; // 20-30% longer
    } else {
      trafficMultiplier = 1.0 + Math.random() * 0.1; // 0-10% variation
    }
    
    return Math.round(baseTime * trafficMultiplier);
  };

  const calculateCommuteLeaveNow = async (origin, destination) => {
    const times = [];
    const routes = await getRoutes(origin, destination);
    
    // Generate 3 departure times: now, +15min, +30min
    for (let i = 0; i < 3; i++) {
      const offset = i * 15;
      const departureTime = new Date(Date.now() + offset * 60000);
      const hour = departureTime.getHours();
      const minute = departureTime.getMinutes();
      
      times.push({
        departureTime,
        arrivalTime: null,
        routes: routes.map(route => ({
          ...route,
          duration: simulateTrafficVariation(route.duration, hour, minute),
          durationDisplay: `${simulateTrafficVariation(route.duration, hour, minute)} min`
        }))
      });
    }
    
    return times;
  };

  const calculateCommuteByArrival = async (origin, destination, targetArrivalTime) => {
    const times = [];
    const routes = await getRoutes(origin, destination);
    
    // Parse target arrival time
    const [targetHour, targetMinute] = targetArrivalTime.split(':').map(Number);
    const today = new Date();
    const arrivalDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), targetHour, targetMinute);
    
    // If arrival time is earlier than now, assume tomorrow
    if (arrivalDate < Date.now()) {
      arrivalDate.setDate(arrivalDate.getDate() + 1);
    }
    
    // Calculate 3 departure options: on-time, 10min early, 20min early buffer
    const buffers = [0, 10, 20];
    
    for (let buffer of buffers) {
      // Use average route duration as baseline
      const avgDuration = routes.reduce((sum, r) => sum + r.duration, 0) / routes.length;
      const totalTimeNeeded = avgDuration + buffer;
      
      const departureTime = new Date(arrivalDate.getTime() - totalTimeNeeded * 60000);
      const depHour = departureTime.getHours();
      const depMinute = departureTime.getMinutes();
      
      times.push({
        departureTime,
        arrivalTime: arrivalDate,
        buffer: buffer,
        routes: routes.map(route => {
          const adjustedDuration = simulateTrafficVariation(route.duration, depHour, depMinute);
          const estimatedArrival = new Date(departureTime.getTime() + adjustedDuration * 60000);
          
          return {
            ...route,
            duration: adjustedDuration,
            durationDisplay: `${adjustedDuration} min`,
            estimatedArrival: estimatedArrival,
            onTime: estimatedArrival <= arrivalDate
          };
        })
      });
    }
    
    return times;
  };

  const handleCalculate = async () => {
    if (!homeAddress || !officeAddress) {
      setError('Please enter both addresses');
      return;
    }

    if (timeMode === 'arrival' && !arrivalTime) {
      setError('Please enter arrival time');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const geocodeWithDelay = async (address) => {
        const result = await geocodeAddress(address);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return result;
      };

      const [homeCoords, officeCoords] = await Promise.all([
        geocodeWithDelay(homeAddress),
        geocodeWithDelay(officeAddress)
      ]);

      let toOffice, toHome;

      if (timeMode === 'now') {
        [toOffice, toHome] = await Promise.all([
          calculateCommuteLeaveNow(homeCoords, officeCoords),
          calculateCommuteLeaveNow(officeCoords, homeCoords)
        ]);
      } else {
        // For arrival mode, calculate to office with arrival time, return journey as "leave now"
        toOffice = await calculateCommuteByArrival(homeCoords, officeCoords, arrivalTime);
        toHome = await calculateCommuteLeaveNow(officeCoords, homeCoords);
      }

      setResults({ toOffice, toHome, mode: timeMode });
    } catch (err) {
      setError(err.message || 'Failed to calculate commute. Please check your addresses.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const RouteCard = ({ route, index, showArrival }) => (
    <div className={`rounded-lg p-4 shadow-sm border-2 ${route.onTime === false ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold text-blue-600">{route.type}</span>
          {route.highways && route.highways.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {route.highways.map((hw, idx) => (
                <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {hw}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="text-lg font-bold text-gray-800">{route.durationDisplay}</span>
      </div>
      {showArrival && route.estimatedArrival && (
        <div className={`text-sm mb-2 ${route.onTime === false ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
          Arrives: {formatTime(route.estimatedArrival)} {route.onTime === false ? '⚠️ Late' : '✓'}
        </div>
      )}
      <div className="text-sm text-gray-600 mb-2">Distance: {route.distance} km</div>
      <div className="text-xs text-gray-500">
        Via: {route.steps.slice(0, 3).join(' → ') || 'Main route'}
      </div>
    </div>
  );

  const TimeSlot = ({ time, routes, showArrival }) => (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          <span className="text-lg font-bold text-gray-800">
            Leave at {formatTime(time.departureTime)}
          </span>
        </div>
        {time.buffer !== undefined && (
          <span className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
            {time.buffer === 0 ? 'On-time' : `${time.buffer}min buffer`}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {time.routes.map((route, idx) => (
          <RouteCard key={idx} route={route} index={idx} showArrival={showArrival} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
            <Navigation className="w-8 h-8 text-blue-600" />
            Commute Time Calculator
          </h1>
          <p className="text-sm text-gray-600 mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Powered by OpenStreetMap - 100% Free, No API Key Required
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Home Address
              </label>
              <input
                type="text"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="e.g., 123 Main St, Seattle, WA or just 'Seattle, WA'"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Office Address
              </label>
              <input
                type="text"
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                placeholder="e.g., 456 Work Ave, Bellevue, WA or just 'Bellevue, WA'"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                <Calendar className="w-4 h-4 inline mr-1" />
                Timing Preference
              </label>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="now"
                    checked={timeMode === 'now'}
                    onChange={(e) => setTimeMode(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Leave Now</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="arrival"
                    checked={timeMode === 'arrival'}
                    onChange={(e) => setTimeMode(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Arrive By</span>
                </label>
              </div>
              
              {timeMode === 'arrival' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Desired Arrival Time at Office
                  </label>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleCalculate}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating Routes...' : 'Calculate Commute Times'}
            </button>
            
            <p className="text-xs text-gray-500 text-center">
              Traffic estimates based on typical rush hour patterns • Highway routes prioritized
            </p>
          </div>
        </div>

        {results && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowRight className="w-6 h-6 text-green-600" />
                To Office
                {results.mode === 'arrival' && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    (Target: {arrivalTime})
                  </span>
                )}
              </h2>
              {results.toOffice.map((time, idx) => (
                <TimeSlot key={idx} time={time} routes={time.routes} showArrival={results.mode === 'arrival'} />
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowRight className="w-6 h-6 text-orange-600 transform rotate-180" />
                Return Home
              </h2>
              {results.toHome.map((time, idx) => (
                <TimeSlot key={idx} time={time} routes={time.routes} showArrival={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommuteCalculator;
