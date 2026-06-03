import os
import random
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Inisialisasi Aplikasi FastAPI
app = FastAPI(title="API Optimasi Lineup Konser Musik Dinamis")

# Mengizinkan koneksi dari Frontend React (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

random.seed(42)
np.random.seed(42)

GLOBAL_DATASET: List[Dict[str, Any]] = []

class OptimizeRequest(BaseModel):
    population_size: int
    max_generations: int
    crossover_rate: float
    mutation_rate: float
    weight_energy: float
    weight_popularity: float
    weight_headliner: float

# ==========================================
# 1. ENDPOINT: SINKRONISASI DATA FROM FRONTEND
# ==========================================

@app.post("/api/upload-dataset")
def upload_dataset(payload: List[Dict[str, Any]]):
    """
    Endpoint untuk menerima dataset yang sedang aktif di halaman web React.
    """
    global GLOBAL_DATASET
    if not payload:
        raise HTTPException(status_code=400, detail="Payload data kosong.")
    
    GLOBAL_DATASET = payload
    return {"status": "success", "message": f"Berhasil sinkronisasi {len(payload)} data musisi ke server."}

# ==========================================
# 2. ALGORITMA GENETIKA CORE LOGIC
# ==========================================

def calculate_fitness(chromosome, df_day, w1, w2, w3):
    """Menghitung nilai kualitas kecocokan lineup (Maksimalisasi)."""
    n = len(chromosome)
    if n == 0:
        return 0

    energies = df_day['Energy'].iloc[chromosome].values
    popularities = df_day['Popularity_score'].iloc[chromosome].values
    is_headliner = df_day['Is_headliner'].iloc[chromosome].values

    energy_score = 0
    popularity_score = 0
    headliner_score = 0

    for i in range(n - 1):
        diff = energies[i+1] - energies[i]
        if diff >= 0:
            energy_score += (diff + 1)  # Reward jika energi naik / konstan
        else:
            energy_score -= abs(diff) * 2  # Pinalti jika drop drastis

    for i in range(n):
        popularity_score += popularities[i] * (i + 1)

    if is_headliner[-1] == 1:
        headliner_score += 100
    else:
        if 1 in is_headliner:
            headliner_score -= 200  # Penalti berat jika aturan dilanggar

    return (w1 * energy_score) + (w2 * popularity_score) + (w3 * headliner_score)

def tournament_selection(population, fitness_scores, k=3):
    selected_indices = random.sample(range(len(population)), k)
    best_idx = selected_indices[0]
    best_fitness = fitness_scores[best_idx]
    for idx in selected_indices[1:]:
        if fitness_scores[idx] > best_fitness:
            best_fitness = fitness_scores[idx]
            best_idx = idx
    return population[best_idx]

def order_crossover(parent1, parent2):
    size = len(parent1)
    start, end = sorted(random.sample(range(size), 2))
    child = np.full(size, -1)
    child[start:end+1] = parent1[start:end+1]
    p2_idx = 0
    for i in range(size):
        if child[i] == -1:
            while parent2[p2_idx] in child:
                p2_idx += 1
            child[i] = parent2[p2_idx]
    return child

def swap_mutation(chromosome, mutation_rate):
    if random.random() < mutation_rate:
        idx1, idx2 = random.sample(range(len(chromosome)), 2)
        chromosome[idx1], chromosome[idx2] = chromosome[idx2], chromosome[idx1]
    return chromosome

def run_evolution_engine(df_day, req: OptimizeRequest):
    """Siklus Utama Generasi Berulang GA."""
    num_artists = len(df_day)
    if num_artists == 0:
        return [], 0

    population = [np.random.permutation(num_artists) for _ in range(req.population_size)]
    
    best_overall_chromosome = None
    best_overall_fitness = float('-inf')

    for gen in range(req.max_generations):
        fitness_scores = [
            calculate_fitness(chrom, df_day, req.weight_energy, req.weight_popularity, req.weight_headliner)
            for chrom in population
        ]

        current_best_idx = np.argmax(fitness_scores)
        current_best_fit = fitness_scores[current_best_idx]

        if current_best_fit > best_overall_fitness:
            best_overall_fitness = current_best_fit
            best_overall_chromosome = population[current_best_idx].copy()

        new_population = []
        new_population.append(best_overall_chromosome.copy())  # Elitisme

        while len(new_population) < req.population_size:
            p1 = tournament_selection(population, fitness_scores)
            p2 = tournament_selection(population, fitness_scores)

            if random.random() < req.crossover_rate:
                child = order_crossover(p1, p2)
            else:
                child = p1.copy()

            child = swap_mutation(child, req.mutation_rate)
            new_population.append(child)

        population = new_population

    return best_overall_chromosome, best_overall_fitness

# ==========================================
# 3. ENDPOINT API: PROSES OPTIMASI DINAMIS
# ==========================================

@app.post("/api/optimize")
def optimize_api(payload: OptimizeRequest):
    """Menjalankan kalkulasi optimasi secara dinamis untuk seluruh hari yang ada pada dataset."""
    global GLOBAL_DATASET
    
    if not GLOBAL_DATASET or len(GLOBAL_DATASET) == 0:
        raise HTTPException(status_code=400, detail="Dataset belum dimuat di backend. Silakan unggah lewat web terlebih dahulu.")

    df = pd.DataFrame(GLOBAL_DATASET)
    
    if 'Artist_name' not in df.columns and 'Nama Artis' in df.columns:
        df.rename(columns={'Nama Artis': 'Artist_name'}, inplace=True)
    if 'Popularity_score' not in df.columns and 'Popularitas' in df.columns:
        df.rename(columns={'Popularitas': 'Popularity_score'}, inplace=True)

    df['Day'] = pd.to_numeric(df['Day']).fillna(1).astype(int)
    df['Energy'] = pd.to_numeric(df['Energy']).fillna(5).astype(int)
    df['Popularity_score'] = pd.to_numeric(df['Popularity_score']).fillna(0.0).astype(float)
    df['Is_headliner'] = pd.to_numeric(df['Is_headliner']).fillna(0).astype(int)

    unique_days = sorted(df['Day'].unique())
    response_data = {}

    for target_day in unique_days:
        df_day = df[df['Day'] == target_day].reset_index(drop=True)
        day_key = f"Day {target_day}"

        if df_day.empty:
            response_data[day_key] = {
                "summary": {"best_fitness": 0, "total_artists": 0, "headliner": "Tidak ada"},
                "lineup": []
            }
            continue

        # Jalankan mesin evolusi GA
        best_chrom, best_fit = run_evolution_engine(df_day, payload)
        df_sorted = df_day.iloc[best_chrom].reset_index(drop=True)
        
        lineup_list = []
        for idx, row in df_sorted.iterrows():
            slot_num = idx + 1
            if idx == 0:
                role_label = "Pembuka"
            elif idx == len(df_sorted) - 1:
                role_label = "Penutup"
            else:
                role_label = "Set-list"

            lineup_list.append({
                "slot": slot_num,
                "artist": str(row['Artist_name']),
                "genre": str(row['Genre'] if 'Genre' in row else 'Pop'),
                "popularity": float(row['Popularity_score']),
                "energy": int(row['Energy']),
                "role": role_label
            })

        headliner_name = lineup_list[-1]['artist'] if len(lineup_list) > 0 else "Tidak ada"

        response_data[day_key] = {
            "summary": {
                "best_fitness": round(float(best_fit), 2),
                "total_artists": len(lineup_list),
                "headliner": headliner_name
            },
            "lineup": lineup_list
        }

    return response_data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)