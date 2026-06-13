import asyncio
import aiohttp
import time
import statistics
import json
import logging
from datetime import datetime
from typing import List, Dict, Tuple
import psutil
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = "http://localhost:8080"
RESULTS_FILE = "test_results.json"

# Test voices
TEST_VOICES = [
    "af_bella",
    "am_adam", 
    "bf_emma",
    "bm_george"
]

# Test texts of varying lengths
TEST_TEXTS = {
    "short": "Hello world.",
    "medium": "This is a medium length text for testing. It contains multiple sentences and should take a bit longer to process.",
    "long": "This is a longer text that contains more content. The TTS engine will need to process this for a longer duration. "
            "This helps us understand how the server handles longer synthesis requests. Multiple voices can blend together "
            "to create unique results. The performance metrics will help us identify bottlenecks."
}


class ServerTester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "tests": {}
        }
        self.process = psutil.Process(os.getpid())
    
    async def health_check(self) -> bool:
        """Check if server is running"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/health", timeout=5) as resp:
                    return resp.status == 200
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    async def single_request(
        self, 
        text: str, 
        voice: str,
        speed: float = 1.0,
        pitch: float = 1.0
    ) -> Tuple[float, bool, str]:
        """
        Send a single TTS request and measure response time.
        Returns (response_time, success, error_message)
        """
        start_time = time.time()
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "text": text,
                    "voice": voice,
                    "speed": speed,
                    "pitch": pitch,
                    "sample_rate": 24000
                }
                async with session.post(
                    f"{self.base_url}/synthesize",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300)  # 5 min timeout
                ) as resp:
                    if resp.status == 200:
                        # Read audio data
                        audio_data = await resp.read()
                        response_time = time.time() - start_time
                        return response_time, True, ""
                    else:
                        error_text = await resp.text()
                        return time.time() - start_time, False, f"Status {resp.status}: {error_text}"
        except asyncio.TimeoutError:
            return time.time() - start_time, False, "Request timeout"
        except Exception as e:
            return time.time() - start_time, False, str(e)
    
    async def test_concurrent_requests(self, num_requests: int, text: str = None, voice: str = None) -> Dict:
        """Test multiple concurrent requests"""
        if text is None:
            text = TEST_TEXTS["medium"]
        if voice is None:
            voice = "af_bella"
        
        logger.info(f"Starting concurrent test with {num_requests} requests...")
        start_time = time.time()
        
        # Create all tasks
        tasks = [
            self.single_request(text, voice)
            for _ in range(num_requests)
        ]
        
        # Run all requests concurrently
        results = await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        response_times = [r[0] for r in results]
        successes = [r[1] for r in results if r[1]]
        failures = [(i, r) for i, r in enumerate(results) if not r[1]]
        
        # Log failures if any
        if failures:
            logger.warning(f"Failed requests: {len(failures)}/{num_requests}")
            for idx, (_, success, error) in failures[:3]:  # Log first 3 failures
                logger.warning(f"  Request {idx}: {error}")
        
        # Compute statistics
        stats = {
            "num_requests": num_requests,
            "total_time": round(total_time, 2),
            "successful": len(successes),
            "failed": len(failures),
            "success_rate": round((len(successes) / num_requests * 100), 2),
            "response_times": {
                "min": round(min(response_times), 2),
                "max": round(max(response_times), 2),
                "mean": round(statistics.mean(response_times), 2),
                "median": round(statistics.median(response_times), 2),
                "stdev": round(statistics.stdev(response_times), 2) if len(response_times) > 1 else 0,
            },
            "throughput": {
                "requests_per_second": round(num_requests / total_time, 2),
                "avg_response_time": round(total_time / num_requests, 2)
            }
        }
        
        logger.info(f"Concurrent test completed:")
        logger.info(f"  Total time: {stats['total_time']}s")
        logger.info(f"  Success rate: {stats['success_rate']}%")
        logger.info(f"  Throughput: {stats['throughput']['requests_per_second']} req/s")
        logger.info(f"  Response time - Mean: {stats['response_times']['mean']}s, Median: {stats['response_times']['median']}s")
        
        return stats
    
    async def test_voice_variations(self, text: str = None) -> Dict:
        """Test different voices sequentially"""
        if text is None:
            text = TEST_TEXTS["medium"]
        
        logger.info("Testing different voices...")
        voice_results = {}
        
        for voice in TEST_VOICES:
            logger.info(f"Testing voice: {voice}")
            response_time, success, error = await self.single_request(text, voice)
            voice_results[voice] = {
                "response_time": round(response_time, 2),
                "success": success,
                "error": error if error else None
            }
        
        return voice_results
    
    async def test_text_length_impact(self) -> Dict:
        """Test impact of text length on performance"""
        logger.info("Testing text length impact...")
        text_results = {}
        
        for text_type, text_content in TEST_TEXTS.items():
            logger.info(f"Testing text type: {text_type} (length: {len(text_content)} chars)")
            response_time, success, error = await self.single_request(text_content, "af_bella")
            text_results[text_type] = {
                "text_length": len(text_content),
                "response_time": round(response_time, 2),
                "success": success,
                "error": error if error else None
            }
        
        return text_results
    
    async def test_speed_pitch_variations(self, text: str = None) -> Dict:
        """Test different speed and pitch settings"""
        if text is None:
            text = TEST_TEXTS["medium"]
        
        logger.info("Testing speed/pitch variations...")
        variations_results = {}
        
        speeds = [0.5, 1.0, 1.5, 2.0]
        pitches = [0.5, 1.0, 1.5, 2.0]
        
        for speed in speeds:
            for pitch in pitches:
                key = f"speed_{speed}_pitch_{pitch}"
                logger.info(f"Testing {key}")
                response_time, success, error = await self.single_request(
                    text, "af_bella", speed=speed, pitch=pitch
                )
                variations_results[key] = {
                    "speed": speed,
                    "pitch": pitch,
                    "response_time": round(response_time, 2),
                    "success": success,
                    "error": error if error else None
                }
        
        return variations_results
    
    def get_system_metrics(self) -> Dict:
        """Get current system metrics"""
        return {
            "cpu_percent": self.process.cpu_percent(interval=0.1),
            "memory_mb": round(self.process.memory_info().rss / 1024 / 1024, 2),
            "timestamp": datetime.now().isoformat()
        }
    
    async def test_stress_level(self, start: int, end: int, step: int) -> Dict:
        """Gradually increase load and measure performance degradation"""
        logger.info(f"Starting stress test: {start} to {end} requests (step: {step})")
        stress_results = []
        
        for num_requests in range(start, end + 1, step):
            logger.info(f"\n--- Testing with {num_requests} concurrent requests ---")
            
            # Get system metrics before
            metrics_before = self.get_system_metrics()
            
            # Run concurrent test
            test_result = await self.test_concurrent_requests(
                num_requests,
                text=TEST_TEXTS["short"],
                voice="af_bella"
            )
            
            # Get system metrics after
            metrics_after = self.get_system_metrics()
            
            stress_results.append({
                "num_requests": num_requests,
                "test_result": test_result,
                "system_metrics_before": metrics_before,
                "system_metrics_after": metrics_after
            })
        
        return stress_results
    
    async def run_full_test_suite(self):
        """Run all tests"""
        logger.info("=" * 60)
        logger.info("Starting Full Performance Test Suite")
        logger.info("=" * 60)
        
        # Check health
        logger.info("Checking server health...")
        if not await self.health_check():
            logger.error("Server is not healthy. Make sure it's running on http://localhost:8000")
            return False
        
        logger.info("Server is healthy. Starting tests...\n")
        
        # Test 1: Single request baseline
        logger.info("Test 1: Single Request Baseline")
        logger.info("-" * 40)
        response_time, success, error = await self.single_request(TEST_TEXTS["medium"], "af_bella")
        self.results["tests"]["single_request"] = {
            "response_time": round(response_time, 2),
            "success": success,
            "error": error if error else None
        }
        logger.info(f"Single request time: {response_time:.2f}s\n")
        
        # Test 2: Concurrent requests (small batches)
        logger.info("Test 2: Concurrent Requests (Small Batches)")
        logger.info("-" * 40)
        for num_concurrent in [2, 3, 5, 6]:
            test_name = f"concurrent_{num_concurrent}"
            self.results["tests"][test_name] = await self.test_concurrent_requests(num_concurrent)
            await asyncio.sleep(1)  # Brief pause between tests
        logger.info("")
        
        # Test 3: Voice variations
        logger.info("Test 3: Voice Variations")
        logger.info("-" * 40)
        self.results["tests"]["voice_variations"] = await self.test_voice_variations()
        logger.info("")
        
        # Test 4: Text length impact
        logger.info("Test 4: Text Length Impact")
        logger.info("-" * 40)
        self.results["tests"]["text_length_impact"] = await self.test_text_length_impact()
        logger.info("")
        
        # Test 5: Speed/Pitch variations
        logger.info("Test 5: Speed/Pitch Variations")
        logger.info("-" * 40)
        self.results["tests"]["speed_pitch_variations"] = await self.test_speed_pitch_variations()
        logger.info("")
        
        # Test 6: Stress test (increasing load)
        logger.info("Test 6: Stress Test (Increasing Load)")
        logger.info("-" * 40)
        self.results["tests"]["stress_test"] = await self.test_stress_level(
            start=3,
            end=12,
            step=3
        )
        logger.info("")
        
        # Save results
        self.save_results()
        
        logger.info("=" * 60)
        logger.info("Test Suite Completed")
        logger.info("=" * 60)
        return True
    
    def save_results(self):
        """Save test results to JSON file"""
        with open(RESULTS_FILE, 'w') as f:
            json.dump(self.results, f, indent=2)
        logger.info(f"Results saved to {RESULTS_FILE}")
    
    def print_summary(self):
        """Print a summary of test results"""
        logger.info("\n" + "=" * 60)
        logger.info("TEST SUMMARY")
        logger.info("=" * 60)
        
        if "concurrent_6" in self.results["tests"]:
            concurrent_6 = self.results["tests"]["concurrent_6"]
            logger.info(f"\n6 Concurrent Requests Performance:")
            logger.info(f"  Success Rate: {concurrent_6['success_rate']}%")
            logger.info(f"  Throughput: {concurrent_6['throughput']['requests_per_second']} req/s")
            logger.info(f"  Avg Response Time: {concurrent_6['response_times']['mean']}s")
            logger.info(f"  Max Response Time: {concurrent_6['response_times']['max']}s")
        
        logger.info(f"\nFull results saved to: {RESULTS_FILE}")


async def main():
    """Main test execution"""
    tester = ServerTester()
    success = await tester.run_full_test_suite()
    
    if success:
        tester.print_summary()
    else:
        logger.error("Test suite failed to complete")


if __name__ == "__main__":
    asyncio.run(main())
