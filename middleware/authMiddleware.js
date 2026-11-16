/**
 * Set strict no-cache/no-store headers to prevent browser caching of authenticated data.
 */
const setNoCacheHeaders = (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
};

exports.setNoCacheHeaders = setNoCacheHeaders;

exports.noCache = (req, res, next) => {
    setNoCacheHeaders(res);
    next();
};

exports.requireAuth = (req, res, next) => {
    setNoCacheHeaders(res);
    if (req.session && req.session.userId) {
        return next();
    } else {
        if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
            return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
        }
        return res.redirect('/login');
    }
};

exports.redirectIfAuth = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role) {
        switch (req.session.role) {
            case 'admin':
                return res.redirect('/admin');
            case 'staff':
            case 'barangay_council':
                if (req.session.staffType === 'RESCUER') {
                    return res.redirect('/rescuer');
                }
                return res.redirect('/staff');
            case 'resident':
                return res.redirect('/resident');
            default:
                return next();
        }
    }
    return next();
};

exports.requireRole = (allowedRoles) => {
    const rolesArray = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
        .map(r => String(r).toLowerCase())
        .map(r => r === 'barangay_council' ? 'staff' : r);

    return (req, res, next) => {
        setNoCacheHeaders(res);
        if (!req.session || !req.session.userId || !req.session.role) {
            if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
                return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
            }
            return res.redirect('/login');
        }
        
        // Normalize current user's role
        const rawRole = String(req.session.role).toLowerCase();
        const userRole = (rawRole === 'barangay_council') ? 'staff' : rawRole;

        // Strictly verify authorization: User role MUST be explicitly included in allowed roles
        if (rolesArray.includes(userRole)) {
            return next();
        }

        // Unauthorized access: 403 for API / AJAX / JSON requests
        if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to access this resource.' });
        }

        // Direct URL access: Redirect authenticated user to their respective home dashboard
        switch (userRole) {
            case 'admin': return res.redirect('/admin');
            case 'staff': return res.redirect('/staff');
            case 'resident': return res.redirect('/resident');
            default: return res.redirect('/login');
        }
    };
};
