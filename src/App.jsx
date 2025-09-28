// src/App.jsx
import { Routes, Route } from "react-router-dom";
import About from "./Components/About";
import Contact from "./Components/Contact";
import BookingForm from "./Components/BookingForm";
import EmiCalculator from "./Components/EmiCalculator";
import Home from "./Components/Home";
import Login from "./Components/Login";
import Register from "./Components/Register";
import Navbar from "./Components/Navbar"; // ✅ new
import Quotation from "./Components/Quotation";
import JobCard from "./Components/JobCard";
import ProtectedRoute from "./compo/ProtectedRoute"
import Admin from "./Components/Admin";
import Mechanic from "./Components/Mechanic";
import Executive from "./Components/Executive";
import Staff from "./Components/Staff";
import Owner from "./Components/Owner";

import User from "./Components/User";
import Employees from "./Components/Employees";


function App() {
  return (
    <>
      <Navbar /> {/* ✅ shown on every page */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />

        <Route path="/login" element={<Login />} />
        <Route path="/quotation" element={<ProtectedRoute><Quotation /></ProtectedRoute>} />
        <Route path="/register" element={<Register />} />
        <Route path="/jobcard" element={<ProtectedRoute><JobCard /></ProtectedRoute>} />

        <Route path="/user" element={<ProtectedRoute><User /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute ><Admin /></ProtectedRoute>} />
        <Route path="/owner" element={<ProtectedRoute ><Owner /></ProtectedRoute>} />
        <Route path="/mechanic" element={<ProtectedRoute ><Mechanic /></ProtectedRoute>} />
        <Route path="/executive" element={<ProtectedRoute ><Executive /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute ><Staff /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
       
       
   
        <Route path="/bookingform" element={<ProtectedRoute><BookingForm /></ProtectedRoute>} />
        <Route path="/about" element={<About />} />
        <Route path="/about-us" element={<About />} />
        <Route path="/emicalculator" element={<ProtectedRoute><EmiCalculator /></ProtectedRoute>} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
    </>
  );
}

export default App;
