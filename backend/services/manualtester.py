import pickle
import pandas as pd
import numpy as np
import os

# --- CRITICAL: This list MUST be identical to the one in your tracker.py ---
FEATURE_ORDER = [
    'kda', 'dmg_to_champions_per_min', 'team_damage_share', 'team_gold_share',
    'gold_diff_15', 'exp_diff_15', 'kill_participation',
    'objective_damage_per_min', 'team_objective_damage_share',
    'vision_score_per_min', 'team_vision_score_share',
    'damage_taken_per_min', 'damage_taken_share',
    'healing_shielding_allies_per_min',
    'gold_diff_per_min',
    'exp_diff_per_min',
    'win_loss'
]

def load_models():
    """Loads the 5 specialist model .pkl files from the parent 'backend' directory."""
    print("--- Loading all specialist models ---")
    models = {}
    roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
    
    script_dir = os.path.dirname(__file__)
    backend_dir = os.path.join(script_dir, '..')

    try:
        for role in roles:
            model_path = os.path.join(backend_dir, f'{role.lower()}_model.pkl')
            with open(model_path, 'rb') as f_model:
                models[role] = pickle.load(f_model)
        print("All 5 models loaded successfully.\n")
        return models
    except FileNotFoundError as e:
        print(f"!!! CRITICAL ERROR: Could not load models. Missing file: {e.filename} !!!")
        print("!!! Please ensure all 5 `_model.pkl` files are in the 'backend' directory. !!!")
        return None

def main():
    models = load_models()
    if not models:
        return

    while True:
        # --- 1. Choose a model to test ---
        print("Which model would you like to test?")
        roles = list(models.keys())
        for i, role in enumerate(roles):
            print(f"  {i+1}: {role}")
        
        role_choice = input(f"Enter a number (1-{len(roles)}) or 'exit' to quit: ")

        if role_choice.lower() == 'exit':
            break
        
        try:
            choice_idx = int(role_choice) - 1
            if not 0 <= choice_idx < len(roles):
                raise ValueError
            selected_role = roles[choice_idx]
            model = models[selected_role]
        except ValueError:
            print("\n*** Invalid choice. Please enter a number from the list. ***\n")
            continue

        print(f"\n--- Testing the {selected_role} model. Please enter the stats for the game. ---")

        # --- 2. Enter metrics for the hypothetical game ---
        metrics = {}
        for feature in FEATURE_ORDER:
            while True:
                try:
                    value = float(input(f"  Enter value for '{feature}': "))
                    metrics[feature] = value
                    break
                except ValueError:
                    print("  *** Invalid input. Please enter a number. ***")
        
        # --- 3. Predict the score ---
        print("\n--- Calculating Score ---")
        model_input_df = pd.DataFrame([metrics], columns=FEATURE_ORDER)
        
        raw_prediction = model.predict(model_input_df)[0]
        final_score = np.clip(raw_prediction, 0, 10)

        # --- 4. Display the result ---
        print("\n" + "="*30)
        print("      PREDICTION RESULTS")
        print("="*30)
        print(f"Model's Raw (Unbounded) Score: {raw_prediction:.4f}")
        print(f"Final Clipped Score (0-10):    {final_score:.2f}")
        print("="*30 + "\n")


if __name__ == "__main__":
    main()

