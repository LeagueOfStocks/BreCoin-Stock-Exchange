import joblib

# Load your model
model = joblib.load('lr_model.joblib')

# Get the coefficients (weights)
coefficients = model.coef_

# Get feature names if you have them
# If you don't have feature names saved, you'll need to recreate them
feature_names = ['feature1', 'feature2', 'feature3']  # Replace with your actual feature names

# Print each feature and its corresponding weight
for feature, coef in zip(feature_names, coefficients):
    print(f"{feature}: {coef}")

# The intercept (bias term)
print(f"Intercept: {model.intercept_}")
