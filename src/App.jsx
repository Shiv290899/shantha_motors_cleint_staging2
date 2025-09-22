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


function App() {
  return (
    <>
      <Navbar /> {/* ✅ shown on every page */}
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />

        <Route path="/login" element={<Login />} />
        <Route path="/quotation" element={<Quotation />} />
        <Route path="/register" element={<Register />} />
        <Route path="/jobcard" element={<JobCard />} />
       
   
        <Route path="/bookingform" element={<BookingForm />} />
        <Route path="/about" element={<About />} />
        <Route path="/about-us" element={<About />} />
        <Route path="/emicalculator" element={<EmiCalculator />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
    </>
  );
}

export default App;
