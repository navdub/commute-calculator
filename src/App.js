import React, { useState } from 'react';
import { Clock, MapPin, Navigation, ArrowRight, AlertCircle } from 'lucide-react';

const CommuteCalculator = () => {
  const [homeAddress, setHomeAddress] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

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

  // Get route using OSRM (OpenStreetMap Routing Machine)
  const getRoute = async (start, end) => {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false&alternatives=true&steps=true`
    );
    const data = await response.json();
    
    if (data.code !== 'Ok') throw new Error('Routing failed');
    
    return data.routes.slice(0, 2).map(route => ({
      duration: Math.round(route.duration / 60), // Convert to minutes
      distance: (route.distance / 1000).toFixed(1), // Convert to km
      steps: route.legs[0].steps.slice(0, 5).map(step => step.name).filter(name => name)
    }));
  };

  // Simulate traffic variations for different departure times
  const simulateTrafficVariation = (baseTime, timeOffset) => {
    // Simulate rush hour traffic (7-9 AM and 5-7 PM)
    const now = new Date();
    const departureTime = new Date(now.getTime() + timeOffset * 60000);
    const hour = departureTime.getHours();
    
    let trafficMultiplier = 1.0;
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      trafficMultiplier = 1.3 + Math.random() * 0.2; // 30-50% longer
    } else if ((hour >= 6 && hour < 7) || (hour >= 9 && hour < 10) || (hour >= 16 && hour < 17) || (hour >= 19 && hour < 20)) {
      trafficMultiplier = 1.15 + Math.random() * 0.15; // 15-30% longer
    } else {
      trafficMultiplier = 1.0 + Math.random() * 0.1; // 0-10% variation
    }
    
    return Math.round(baseTime * trafficMultiplier);
  };

  const calculateCommute = async (origin, destination) => {
    const times = [];
    
    // Get base route
    const routes = await getRoute(origin, destination);
    
    // Generate 3 departure times: now, +15min, +30min
    for (let i = 0; i < 3; i++) {
      const offset = i * 15;
      const departureTime = new Date(Date.now() + offset * 60000);
      
      times.push({
        departureTime,
        routes: routes.map(route => ({
          ...route,
          duration: simulateTrafficVariation(route.duration, offset),
          durationDisplay: `${simulateTrafficVariation(route.duration, offset)} min`
        }))
      });
    }
    
    return times;
  };

  const handleCalculate = async () => {
    if (!homeAddress || !officeAddress) {
      setError('Please enter both addresses');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      // Add delay to respect Nominatim rate limits
      const geocodeWithDelay = async (address) => {
        const result = await geocodeAddress(address);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return result;
      };

      const [homeCoords, officeCoords] = await Promise.all([
        geocodeWithDelay(homeAddress),
        geocodeWithDelay(officeAddress)
      ]);

      const [toOffice, toHome] = await Promise.all([
        calculateCommute(homeCoords, officeCoords),
        calculateCommute(officeCoords, homeCoords)
      ]);

      setResults({ toOffice, toHome });
    } catch (err) {
      setError(err.message || 'Failed to calculate commute. Please check your addresses.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const RouteCard = ({ route, index }) => (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-blue-600">Route {index + 1}</span>
        <span className="text-lg font-bold text-gray-800">{route.durationDisplay}</span>
      </div>
      <div className="text-sm text-gray-600 mb-2">Distance: {route.distance} km</div>
      <div className="text-xs text-gray-500">
        Via: {route.steps.slice(0, 3).join(' → ') || 'Main route'}
      </div>
    </div>
  );

  const TimeSlot = ({ time, routes }) => (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5 text-blue-600" />
        <span className="text-lg font-bold text-gray-800">
          Leave at {formatTime(time.departureTime)}
        </span>
      </div>
      <div className="space-y-2">
        {time.routes.map((route, idx) => (
          <RouteCard key={idx} route={route} index={idx} />
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
              {loading ? 'Calculating...' : 'Calculate Commute Times'}
            </button>
            
            <p className="text-xs text-gray-500 text-center">
              Traffic estimates are simulated based on typical rush hour patterns
            </p>
          </div>
        </div>

        {results && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowRight className="w-6 h-6 text-green-600" />
                To Office
              </h2>
              {results.toOffice.map((time, idx) => (
                <TimeSlot key={idx} time={time} routes={time.routes} />
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowRight className="w-6 h-6 text-orange-600 transform rotate-180" />
                Return Home
              </h2>
              {results.toHome.map((time, idx) => (
                <TimeSlot key={idx} time={time} routes={time.routes} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommuteCalculator;
