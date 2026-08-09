import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Leaf,
  ArrowRight,
  ScanFace,
} from "lucide-react";
import {
  login,
 
  getMe,
  clearError,
} from "../../features/authSlice";
import toast from "react-hot-toast";
import FaceLogin from "../../components/common/FaceLogin";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showFaceLogin, setShowFaceLogin] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const { loading, error } = useSelector((s) => s.auth);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const from = location.state?.from?.pathname || "/";

  const onSubmit = async (formData) => {
    dispatch(clearError());

    // clear old cached data before new login
    queryClient.clear();

    const result = await dispatch(login(formData));

    if (login.fulfilled.match(result)) {
      // fetch fresh profile
      await dispatch(getMe());

      toast.success("Welcome back!");

      const role = result.payload.data.role;

      const dashMap = {
        customer: "/dashboard",
        farmer: "/farmer/dashboard",
        delivery: "/delivery/dashboard",
        admin: "/admin/dashboard",
      };

      navigate(from !== "/" ? from : dashMap[role] || "/dashboard");
    } else {
      if (result.payload?.needsVerification) {
        toast.error(result.payload.message);
        navigate("/verify-otp", { state: { email: result.payload.email } });
      } else {
        toast.error(result.payload?.message || result.payload || "Login failed");
      }
    }
  };

 

  return (
    <div className="min-h-screen flex" id="login-page">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-sky-600 via-sky-700 to-emerald-700 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-96 h-96 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-72 h-72 rounded-full bg-emerald-400 blur-3xl" />
        </div>

        <div className="relative text-white max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Leaf className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold">
              Farm<span className="text-emerald-300">2</span>Door
            </span>
          </Link>

          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Welcome Back to Fresh Living
          </h2>

          <p className="text-sky-100 text-lg leading-relaxed">
            Access farm-fresh produce from local farmers delivered to your
            doorstep in under 2 hours.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { n: "2,500+", l: "Farmers" },
              { n: "50K+", l: "Customers" },
              { n: "98%", l: "Satisfaction" },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white/10 backdrop-blur rounded-xl p-4 text-center"
              >
                <p className="text-2xl font-bold">{s.n}</p>
                <p className="text-xs text-sky-200">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">
              Farm<span className="text-sky-500">2</span>Door
            </span>
          </Link>

          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Sign In
          </h1>

          <p className="text-neutral-500 mb-8">
            Enter your credentials to access your account
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Email
              </label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />

                <input
                  {...register("email", {
                    required: "Email is required",
                    pattern: {
                      value: /^\S+@\S+$/i,
                      message: "Invalid email",
                    },
                  })}
                  type="email"
                  className={`input pl-11 ${
                    errors.email ? "input-error" : ""
                  }`}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-neutral-700">
                  Password
                </label>

                <Link
                  to="/forgot-password"
                  className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                >
                  Forgot?
                </Link>
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />

                <input
                  {...register("password", {
                    required: "Password is required",
                  })}
                  type={showPassword ? "text" : "password"}
                  className={`input pl-11 pr-11 ${
                    errors.password ? "input-error" : ""
                  }`}
                  placeholder="••••••••"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3.5 !text-base"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* OR Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-sm text-neutral-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          {/* Face Login Button */}
          <button
            onClick={() => setShowFaceLogin(true)}
            className="btn-secondary w-full !py-3.5 !text-base"
            id="face-login-button"
          >
            <ScanFace className="w-5 h-5" />
            Login with Face
          </button>

          {/* Face Login Modal */}
          {showFaceLogin && (
            <FaceLogin onClose={() => setShowFaceLogin(false)} />
          )}

          <p className="text-center text-sm text-neutral-500 mt-8">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-sky-600 font-semibold hover:text-sky-700"
            >
              Create account
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}