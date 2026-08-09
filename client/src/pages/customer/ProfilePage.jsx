import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSelector, useDispatch } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Mail, Phone, Save, Lock, ShieldCheck, ScanFace, Trash2 } from 'lucide-react';
import { authAPI, faceAPI } from '../../api';
import toast from 'react-hot-toast';
import { setUser } from '../../features/authSlice';
import FaceEnrollment from '../../components/common/FaceEnrollment';

export default function ProfilePage() {
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  const [showFaceEnroll, setShowFaceEnroll] = useState(false);

  // Face auth status query
  const { data: faceStatus, refetch: refetchFaceStatus } = useQuery({
    queryKey: ['faceStatus'],
    queryFn: async () => {
      const { data } = await faceAPI.getStatus();
      return data.data;
    },
  });

  // Face unenroll mutation
  const unenrollMutation = useMutation({
    mutationFn: () => faceAPI.unenroll(),
    onSuccess: () => {
      refetchFaceStatus();
      toast.success('Face authentication removed');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove face auth'),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const { register: registerPassword, handleSubmit: handlePasswordSubmit, reset: resetPassword, formState: { errors: pwdErrors } } = useForm();

  useEffect(() => {
    if (user) {
      reset({ name: user.name, email: user.email, phone: user.phone });
    }
  }, [user, reset]);

  const profileMutation = useMutation({
    mutationFn: (data) => authAPI.updateProfile(data),
    onSuccess: (res) => {
      dispatch(setUser(res.data.data));
      queryClient.invalidateQueries(['userProfile']);
      toast.success('Profile updated successfully!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update profile'),
  });

  const passwordMutation = useMutation({
    mutationFn: (data) => authAPI.updatePassword(data),
    onSuccess: () => {
      resetPassword();
      toast.success('Password changed successfully!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to change password'),
  });

  return (
    <div id="customer-profile" className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">My Profile</h1>
        <p className="text-neutral-500 text-sm">Manage your account details and security</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-sky-500" /> Personal Information</h3>
            <form onSubmit={handleSubmit(profileMutation.mutate)} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input {...register('name', { required: 'Name is required' })} className="input pl-11" />
                  </div>
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input {...register('phone')} className="input pl-11" placeholder="+91 00000 00000" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input {...register('email', { required: 'Email is required' })} type="email" className="input pl-11" disabled />
                </div>
                <p className="text-xs text-neutral-500 mt-1">Email cannot be changed once registered.</p>
              </div>
              <button type="submit" disabled={profileMutation.isLoading} className="btn-primary !py-2.5">
                {profileMutation.isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
              </button>
            </form>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-amber-500" /> Security</h3>
            <form onSubmit={handlePasswordSubmit(passwordMutation.mutate)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Current Password</label>
                <input {...registerPassword('currentPassword', { required: 'Required' })} type="password" className="input" placeholder="••••••••" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">New Password</label>
                  <input {...registerPassword('newPassword', { required: 'Required', minLength: { value: 6, message: 'Min 6 chars' } })} type="password" className="input" placeholder="••••••••" />
                  {pwdErrors.newPassword && <p className="text-red-500 text-xs mt-1">{pwdErrors.newPassword.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm New Password</label>
                  <input {...registerPassword('confirmPassword', { 
                    required: 'Required', 
                    validate: (val, formValues) => val === formValues.newPassword || 'Passwords do not match' 
                  })} type="password" className="input" placeholder="••••••••" />
                  {pwdErrors.confirmPassword && <p className="text-red-500 text-xs mt-1">{pwdErrors.confirmPassword.message}</p>}
                </div>
              </div>
              <button type="submit" disabled={passwordMutation.isLoading} className="btn-secondary !py-2.5">
                {passwordMutation.isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-sky-500/30">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <h3 className="font-bold text-neutral-900 text-lg">{user?.name}</h3>
            <p className="text-sm text-neutral-500 mb-4">{user?.email}</p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Account
            </div>
          </div>

          {/* Face Authentication Card */}
          <div className="card p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-purple-500" />
              Face Login
            </h3>

            {faceStatus?.enrolled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">Enrolled</p>
                    <p className="text-xs text-emerald-600">
                      Since {new Date(faceStatus.enrolledAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Remove face authentication? You can re-enroll anytime.')) {
                      unenrollMutation.mutate();
                    }
                  }}
                  disabled={unenrollMutation.isPending}
                  className="btn-ghost w-full text-red-500 hover:bg-red-50 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  {unenrollMutation.isPending ? 'Removing...' : 'Remove Face Login'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">
                  Sign in faster using your face. Secure facial recognition powered by ArcFace.
                </p>
                <button
                  onClick={() => setShowFaceEnroll(true)}
                  className="btn-primary w-full !py-2.5 text-sm"
                >
                  <ScanFace className="w-4 h-4" />
                  Set Up Face Login
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Face Enrollment Modal */}
        {showFaceEnroll && (
          <FaceEnrollment
            onClose={() => setShowFaceEnroll(false)}
            onSuccess={() => {
              refetchFaceStatus();
              setShowFaceEnroll(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
