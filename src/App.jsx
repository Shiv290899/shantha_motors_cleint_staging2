import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./Components/Navbar"; // keep eager for layout
import ProtectedRoute from "./compo/ProtectedRoute";
import GuestRoute from "./compo/GuestRoute";

// Route-level code splitting (lazy loaded pages)
const About = lazy(() => import("./Components/About"));
const Contact = lazy(() => import("./Components/Contact"));
const BookingForm = lazy(() => import("./Components/BookingForm"));
const EmiCalculator = lazy(() => import("./Components/EmiCalculator"));
const Home = lazy(() => import("./Components/Home"));
const Login = lazy(() => import("./Components/Login"));
const Register = lazy(() => import("./Components/Register"));
const Quotation = lazy(() => import("./Components/Quotation"));
const JobCard = lazy(() => import("./Components/JobCard"));
const Admin = lazy(() => import("./Components/Admin"));
const Mechanic = lazy(() => import("./Components/Mechanic"));
const Staff = lazy(() => import("./Components/Staff"));
const Owner = lazy(() => import("./Components/Owner"));
const StockUpdate = lazy(() => import("./Components/StockUpdate"));
const RoleRedirect = lazy(() => import("./Components/RoleRedirect"));
const Backend = lazy(() => import("./Components/Backend"));
const Employees = lazy(() => import("./Components/Employees"));
const Products = lazy(() => import("./Components/Products"));
const Service = lazy(() => import("./Components/Service"));
const Gallery = lazy(() => import("./Components/Gallery"));


function App() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />

          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/quotation" element={<ProtectedRoute><Quotation /></ProtectedRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/jobcard" element={<ProtectedRoute><JobCard /></ProtectedRoute>} />
          <Route path="/stock" element={<ProtectedRoute><StockUpdate /></ProtectedRoute>} />

          {/* Dynamic redirect based on user role */}
          <Route path="/dashboard" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><Admin /></ProtectedRoute>} />
          <Route path="/owner" element={<ProtectedRoute roles={["owner"]}><Owner /></ProtectedRoute>} />
          <Route path="/mechanic" element={<ProtectedRoute><Mechanic /></ProtectedRoute>} />
          
          <Route path="/staff" element={<ProtectedRoute roles={["staff"]}><Staff /></ProtectedRoute>} />
          <Route path="/backend" element={<ProtectedRoute roles={["backend"]}><Backend /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />

          <Route path="/bookingform" element={<ProtectedRoute><BookingForm /></ProtectedRoute>} />
          <Route path="/about" element={<About />} />
          <Route path="/about-us" element={<About />} />
          <Route path="/emicalculator" element={<ProtectedRoute><EmiCalculator /></ProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/products" element={<Products />} />
          <Route path="/service" element={<Service />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
