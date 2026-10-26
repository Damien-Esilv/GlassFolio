import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const Goals: React.FC = () => {
  const location = useLocation();
  // Preserve query parameters when redirecting
  return <Navigate to={`/progress${location.search}`} replace />;
};

export default Goals;