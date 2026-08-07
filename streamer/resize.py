import os
from PIL import Image

# 목표 크기: 카드 실제 크기(160px)의 2배인 320px (레티나 디스플레이 대응)
TARGET_HEIGHT = 320

def resize_images():
    files = os.listdir('.')
    print("✨ 고화질 리사이징을 시작합니다 (LANCZOS 알고리즘 적용)...")

    count = 0
    for filename in files:
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            try:
                with Image.open(filename) as img:
                    # 이미지가 목표보다 클 때만 줄임
                    if img.height > TARGET_HEIGHT:
                        # 비율 유지하며 리사이징
                        ratio = TARGET_HEIGHT / img.height
                        new_width = int(img.width * ratio)
                        
                        # LANCZOS: 현존하는 최고의 다운샘플링 알고리즘 (계단현상 제거 탁월)
                        img_resized = img.resize((new_width, TARGET_HEIGHT), Image.Resampling.LANCZOS)
                        
                        img_resized.save(filename)
                        print(f"✅ 변환 완료: {filename}")
                        count += 1
            except Exception as e:
                print(f"❌ 오류: {filename}")

    print(f"\n🎉 총 {count}개의 이미지를 최적화했습니다.")

if __name__ == "__main__":
    resize_images()