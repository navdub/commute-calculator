import React, { useState } from 'react';
import { Clock, MapPin, Navigation, ArrowRight, Calendar } from 'lucide-react';

const CommuteCalculator = () => {
  const [homeAddress, setHomeAddress] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const calculateCommute = async (origin, destination, isReturn = false) => {
    const now = new Date();
    const times = [];
    
    // Generate 3 departure times: now, +30min, +60min
    for (let i = 0; i < 3; i++) {
      const departureTime = new Date(now.getTime() + (i * 30 * 60 * 1000));
      times.push(Math.floor(departureTime.getTime() / 1000));
    }

    const routePromises = times.map(async (time) => {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departure_time=${time}&alternatives=true&key=${apiKey}`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK') {
          return {
            departureTime: new Date(time * 1000),
            routes: data.routes.slice(0, 2).map(route => ({
              summary: route.summary,
              duration: route.legs[0].duration_in_traffic?.text || route.legs[0].duration.text,
              durationValue: route.legs[0].duration_in_traffic?.value || route.legs[0].duration.value,
              distance: route.legs[0].distance.text,
              steps: route.legs[0].steps.map(step => step.html_instructions.replace(/<[^>]*>/g, '')).slice(0, 3)
            }))
          };
        }
        return null;
      } catch (err) {
        console.error('API Error:', err);
        return null;
      }
    });

    const results = await Promise.all(routePromises);
    return results.filter(r => r !== null);
  };

  const handleCalculate = async () => {
    if (!homeAddress || !officeAddress || !apiKey) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const [toOffice, toHome] = await Promise.all([
        calculateCommute(homeAddress, officeAddress, false),
        calculateCommute(officeAddress, homeAddress, true)
      ]);

      setResults({ toOffice, toHome });
    } catch (err) {
      setError('Failed to calculate commute. Please check your API key and addresses.');
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
        <span className="font-semibold text-blue-600">Route {index + 1}: {route.summary}</span>
        <span className="text-lg font-bold text-gray-800">{route.duration}</span>
      </div>
      <div className="text-sm text-gray-600 mb-2">Distance: {route.distance}</div>
      <div className="text-xs text-gray-500">
        {route.steps.slice(0, 2).join(' → ')}
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
          <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <Navigation className="w-8 h-8 text-blue-600" />
            Commute Time Calculator
          </h1>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Maps API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your API key from Google Cloud Console
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Home Address
              </label>
              <input
                type="text"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="123 Main St, City, State"
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
                placeholder="456 Work Ave, City, State"
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
