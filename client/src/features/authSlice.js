import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authAPI, faceAPI } from "../api";

// Load user from localStorage
let savedUser = null;

try {
  const rawUser = localStorage.getItem("farm2door_user");
  if (rawUser && rawUser !== "undefined") {
    savedUser = JSON.parse(rawUser);
  }
} catch (error) {
  console.error("Corrupted localStorage user data");
  localStorage.removeItem("farm2door_user");
}
const savedToken = localStorage.getItem("farm2door_token");

// LOGIN
export const login = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const { data } = await authAPI.login(credentials);

      localStorage.setItem("farm2door_token", data.token);
      localStorage.setItem("farm2door_user", JSON.stringify(data.data));

      return data;
    } catch (error) {
     return rejectWithValue(
  error.response?.data?.message || "Login failed"
);
    }
  }
);

// REGISTER
export const register = createAsyncThunk(
  "auth/register",
  async (userData, { rejectWithValue }) => {
    try {
      const { data } = await authAPI.register(userData);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Registration failed"
      );
    }
  }
);

// GET ME (important for fresh profile)
export const getMe = createAsyncThunk(
  "auth/getMe",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await authAPI.getMe();
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch profile"
      );
    }
  }
);

// LOGOUT
export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await authAPI.logout();
  } catch (e) {}

  localStorage.removeItem("farm2door_token");
  localStorage.removeItem("farm2door_user");
});

// FACE LOGIN
export const faceLogin = createAsyncThunk(
  "auth/faceLogin",
  async ({ email, image }, { rejectWithValue }) => {
    try {
      const { data } = await faceAPI.verify({ email, image });

      localStorage.setItem("farm2door_token", data.token);
      localStorage.setItem("farm2door_user", JSON.stringify(data.data));

      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Face login failed"
      );
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: savedUser,
    token: savedToken,
    farmerProfile: null,
    deliveryProfile: null,
    isAuthenticated: !!savedToken,
    loading: false,
    error: null,
  },

  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = true;

      // keep localStorage synced
      localStorage.setItem(
        "farm2door_user",
        JSON.stringify(action.payload)
      );
    },
  },

  extraReducers: (builder) => {
    builder

      // LOGIN
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.data;
        state.token = action.payload.token;
      })

      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // REGISTER
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        // User is not authenticated until they verify OTP and login
      })

      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // GET ME
      .addCase(getMe.fulfilled, (state, action) => {
        state.user = action.payload.data.user;
        state.farmerProfile = action.payload.data.farmerProfile;
        state.deliveryProfile = action.payload.data.deliveryProfile;

        localStorage.setItem(
          "farm2door_user",
          JSON.stringify(action.payload.data.user)
        );
      })

      // LOGOUT
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.farmerProfile = null;
        state.deliveryProfile = null;
        state.loading = false;
        state.error = null;
      })

      // FACE LOGIN (same state changes as password login)
      .addCase(faceLogin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(faceLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.data;
        state.token = action.payload.token;
      })

      .addCase(faceLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, setUser } = authSlice.actions;
export default authSlice.reducer;