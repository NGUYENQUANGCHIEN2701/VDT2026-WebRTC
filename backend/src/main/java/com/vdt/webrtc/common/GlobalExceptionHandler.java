package com.vdt.webrtc.common;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.vdt.webrtc.auth.EmailNotVerifiedException;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

        @ExceptionHandler(DuplicateResourceException.class)
        public ResponseEntity<ApiError> handleDuplicateResource(DuplicateResourceException ex,
                        HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(build(HttpStatus.CONFLICT, ex.getMessage(), null, request));
        }

        @ExceptionHandler(BadCredentialsException.class)
        public ResponseEntity<ApiError> handleBadCredentials(BadCredentialsException ex, HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body(build(HttpStatus.UNAUTHORIZED, "Invalid username or password", null, request));
        }

        @ExceptionHandler(InvalidRefreshTokenException.class)
        public ResponseEntity<ApiError> handleInvalidRefreshToken(InvalidRefreshTokenException ex,
                        HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body(build(HttpStatus.UNAUTHORIZED, ex.getMessage(), null, request));
        }

        @ExceptionHandler(UserNotFoundException.class)
        public ResponseEntity<ApiError> handleUserNotFound(UserNotFoundException ex, HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                                .body(build(HttpStatus.NOT_FOUND, ex.getMessage(), null, request));
        }

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(build(HttpStatus.BAD_REQUEST, ex.getMessage(), null, request));
        }

        @ExceptionHandler(MethodArgumentNotValidException.class)
        public ResponseEntity<ApiError> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                        HttpServletRequest request) {
                Map<String, String> fieldErrors = new HashMap<>();
                ex.getBindingResult().getFieldErrors()
                                .forEach(error -> fieldErrors.put(error.getField(), error.getDefaultMessage()));
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(build(HttpStatus.BAD_REQUEST, "Validation failed", fieldErrors, request));
        }

        @ExceptionHandler(LockedException.class)
        public ResponseEntity<ApiError> handleLocked(
                        LockedException ex, HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body(build(HttpStatus.FORBIDDEN, "Tài khoản đã bị khóa", null, request));
        }

        @ExceptionHandler(EmailNotVerifiedException.class)
        public ResponseEntity<ApiError> handleEmailNotVerified(
                        EmailNotVerifiedException ex, HttpServletRequest request) {
                Map<String, String> details = new HashMap<>();
                details.put("reason", "EMAIL_NOT_VERIFIED");
                details.put("email", ex.getEmail());
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body(build(HttpStatus.FORBIDDEN, "Email is not verified", details, request));
        }

        @ExceptionHandler(RateLimitExceededException.class)
        public ResponseEntity<ApiError> handleRateLimitExceeded(
                        RateLimitExceededException ex, HttpServletRequest request) {
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                                .body(build(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage(), null, request));
        }

        @ExceptionHandler(Exception.class)
        public ResponseEntity<ApiError> handleGeneralException(Exception ex, HttpServletRequest request) {
                // Log full details server-side; client only sees a generic message.
                log.error("Unhandled exception at {}", request.getRequestURI(), ex);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(build(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred", null,
                                                request));
        }

        private ApiError build(HttpStatus status, String message,
                        Map<String, String> fieldErrors, HttpServletRequest req) {
                return new ApiError(
                                Instant.now(),
                                status.value(),
                                status.getReasonPhrase(),
                                message,
                                req.getRequestURI(),
                                fieldErrors);
        }
}
